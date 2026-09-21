package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime/debug"
	"sort"
	"strings"
	"unicode/utf8"
)

const protocolVersion = 1
const defaultMemoryLimit = 768 * 1024 * 1024

type request struct {
	ProtocolVersion int           `json:"protocolVersion"`
	WorkspaceRoot   string        `json:"workspaceRoot"`
	InputRoots      []string      `json:"inputRoots"`
	Output          outputRequest `json:"output"`
	Pieces          []piece       `json:"pieces"`
}

type outputRequest struct {
	CodePath     string  `json:"codePath"`
	MapPath      string  `json:"mapPath"`
	File         *string `json:"file"`
	SourcePrefix *string `json:"sourcePrefix"`
}

type piece struct {
	Kind         string `json:"kind"`
	Value        string `json:"value"`
	CodePath     string `json:"codePath"`
	MapPath      string `json:"mapPath"`
	RelativePath string `json:"relativePath"`
}

type response struct {
	ProtocolVersion int    `json:"protocolVersion"`
	Success         bool   `json:"success"`
	CodePath        string `json:"codePath,omitempty"`
	MapPath         string `json:"mapPath,omitempty"`
	CodeBytes       int64  `json:"codeBytes,omitempty"`
	MapBytes        int64  `json:"mapBytes,omitempty"`
	CodeSHA256      string `json:"codeSha256,omitempty"`
	MapSHA256       string `json:"mapSha256,omitempty"`
	Error           string `json:"error,omitempty"`
}

type rawMap struct {
	Version        json.RawMessage    `json:"version"`
	Sources        []string           `json:"sources"`
	Names          []string           `json:"names"`
	SourceRoot     *string            `json:"sourceRoot"`
	SourcesContent []*json.RawMessage `json:"sourcesContent"`
	Mappings       string             `json:"mappings"`
	Sections       []rawSection       `json:"sections"`
}

type rawSection struct {
	Offset rawOffset `json:"offset"`
	Map    rawMap    `json:"map"`
}

type rawOffset struct{ Line, Column uint32 }

func (o *rawOffset) UnmarshalJSON(data []byte) error {
	var value struct{ Line, Column uint32 }
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	o.Line, o.Column = value.Line, value.Column
	return nil
}

type mapping struct {
	GeneratedLine, GeneratedColumn             uint32
	Source, OriginalLine, OriginalColumn, Name uint32
	HasOriginal, HasName                       bool
}

type inflatedMapping struct {
	GeneratedLine, GeneratedColumn uint32
	Source, Name                   *string
	OriginalLine, OriginalColumn   *uint32
}

type originalLocation struct {
	Source, Line, Column uint32
	Name                 uint32
	HasName              bool
}

type codeOutput struct {
	writer       *bufio.Writer
	bytes        int64
	line, column uint32
	active       originalLocation
	hasActive    bool
}

type contentLocation struct{ offset, length int64 }

type mapOutput struct {
	mappingPath, contentPath                                                                   string
	mappingFile, contentFile                                                                   *os.File
	mappingWriter, contentWriter                                                               *bufio.Writer
	sources, names                                                                             []string
	sourceIndexes, nameIndexes                                                                 map[string]uint32
	contents                                                                                   map[string]contentLocation
	contentBytes                                                                               int64
	pending                                                                                    []mapping
	previousLine                                                                               uint32
	previousColumn, previousSource, previousOriginalLine, previousOriginalColumn, previousName int64
	wrote                                                                                      bool
	prefix                                                                                     *string
}

type composer struct {
	code codeOutput
	smap mapOutput
}

func main() {
	if os.Getenv("GOMEMLIMIT") == "" {
		debug.SetMemoryLimit(defaultMemoryLimit)
	}

	if err := run(); err != nil {
		_ = json.NewEncoder(os.Stdout).Encode(response{ProtocolVersion: protocolVersion, Success: false, Error: err.Error()})
		os.Exit(1)
	}
}

func run() error {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		return fmt.Errorf("parsing helper request: %w", err)
	}
	result, err := execute(req)
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(result)
}

func execute(req request) (response, error) {
	if req.ProtocolVersion != protocolVersion {
		return response{}, fmt.Errorf("unsupported protocol version %d; expected %d", req.ProtocolVersion, protocolVersion)
	}
	root, err := filepath.EvalSymlinks(req.WorkspaceRoot)
	if err != nil {
		return response{}, err
	}
	if err := validateOutput(root, req.Output.CodePath); err != nil {
		return response{}, err
	}
	if err := validateOutput(root, req.Output.MapPath); err != nil {
		return response{}, err
	}
	roots := []string{root}
	for _, inputRoot := range req.InputRoots {
		canonical, e := filepath.EvalSymlinks(inputRoot)
		if e != nil {
			return response{}, e
		}
		roots = append(roots, canonical)
	}
	if err := os.MkdirAll(filepath.Dir(req.Output.CodePath), 0755); err != nil {
		return response{}, err
	}
	if err := os.MkdirAll(filepath.Dir(req.Output.MapPath), 0755); err != nil {
		return response{}, err
	}
	codeFile, err := os.Create(req.Output.CodePath)
	if err != nil {
		return response{}, err
	}
	mappingPath := siblingTemp(req.Output.MapPath, "mappings")
	contentPath := siblingTemp(req.Output.MapPath, "source-contents")
	mappingFile, err := os.Create(mappingPath)
	if err != nil {
		return response{}, err
	}
	contentFile, err := os.Create(contentPath)
	if err != nil {
		return response{}, err
	}
	c := composer{
		code: codeOutput{writer: bufio.NewWriter(codeFile), line: 1},
		smap: mapOutput{mappingPath: mappingPath, contentPath: contentPath, mappingFile: mappingFile, contentFile: contentFile,
			mappingWriter: bufio.NewWriter(mappingFile), contentWriter: bufio.NewWriter(contentFile), sourceIndexes: map[string]uint32{},
			nameIndexes: map[string]uint32{}, sources: []string{}, names: []string{}, contents: map[string]contentLocation{}, previousLine: 1, prefix: req.Output.SourcePrefix},
	}
	cleanup := func() {
		codeFile.Close()
		mappingFile.Close()
		contentFile.Close()
		os.Remove(mappingPath)
		os.Remove(contentPath)
	}
	defer cleanup()
	for _, p := range req.Pieces {
		switch p.Kind {
		case "literal":
			err = c.emit(p.Value, nil)
		case "mapped":
			if err = validateInput(roots, p.CodePath); err == nil {
				err = validateInput(roots, p.MapPath)
			}
			if err == nil {
				err = c.emitMapped(p)
			}
		default:
			err = fmt.Errorf("unsupported piece kind %q", p.Kind)
		}
		if err != nil {
			os.Remove(req.Output.CodePath)
			os.Remove(req.Output.MapPath)
			return response{}, err
		}
	}
	if err = c.code.writer.Flush(); err != nil {
		return response{}, err
	}
	if err = codeFile.Close(); err != nil {
		return response{}, err
	}
	if err = c.smap.finish(req.Output.MapPath, req.Output.File); err != nil {
		return response{}, err
	}
	codeHash, err := hashFile(req.Output.CodePath)
	if err != nil {
		return response{}, err
	}
	mapHash, err := hashFile(req.Output.MapPath)
	if err != nil {
		return response{}, err
	}
	mapInfo, err := os.Stat(req.Output.MapPath)
	if err != nil {
		return response{}, err
	}
	return response{ProtocolVersion: protocolVersion, Success: true, CodePath: req.Output.CodePath, MapPath: req.Output.MapPath,
		CodeBytes: c.code.bytes, MapBytes: mapInfo.Size(), CodeSHA256: codeHash, MapSHA256: mapHash}, nil
}

func (c *composer) emitMapped(p piece) error {
	codeBytes, err := os.ReadFile(p.CodePath)
	if err != nil {
		return err
	}
	mapBytes, err := os.ReadFile(p.MapPath)
	if err != nil {
		return err
	}
	mapBytes = stripXSSI(mapBytes)
	var sourceMap rawMap
	if err := json.Unmarshal(mapBytes, &sourceMap); err != nil {
		return fmt.Errorf("parsing source map JSON: %w", err)
	}
	if err := validateVersion(sourceMap.Version); err != nil {
		return err
	}
	if len(sourceMap.Sections) > 0 {
		return c.emitIndexed(string(codeBytes), &sourceMap, p.RelativePath)
	}
	sources := make([]string, len(sourceMap.Sources))
	for i, source := range sourceMap.Sources {
		resolved := computeSourceURL(sourceMap.SourceRoot, normalizePath(source))
		if p.RelativePath != "" {
			resolved = joinPath(p.RelativePath, resolved)
		}
		sources[i] = resolved
	}
	if err := c.emitBasic(string(codeBytes), &sourceMap, sources); err != nil {
		return err
	}
	for i, raw := range sourceMap.SourcesContent {
		if raw != nil && i < len(sources) {
			var content string
			if err := json.Unmarshal(*raw, &content); err != nil {
				return err
			}
			if err := c.smap.setContent(sources[i], content); err != nil {
				return err
			}
		}
	}
	return nil
}

func (c *composer) emitBasic(code string, sourceMap *rawMap, sources []string) error {
	cursor := newCodeCursor(code)
	var last *mapping
	lastLine, lastColumn := uint32(1), uint32(0)
	err := decodeMappings(sourceMap.Mappings, func(current mapping) error {
		if last != nil {
			if lastLine < current.GeneratedLine {
				if err := c.emitDecoded(cursor.takeLine(), *last, sourceMap, sources); err != nil {
					return err
				}
				lastLine++
				lastColumn = 0
			} else {
				width := current.GeneratedColumn - min(current.GeneratedColumn, lastColumn)
				if err := c.emitDecoded(cursor.takePrefix(width), *last, sourceMap, sources); err != nil {
					return err
				}
				lastColumn = current.GeneratedColumn
				copy := current
				last = &copy
				return nil
			}
		}
		for lastLine < current.GeneratedLine {
			if err := c.emit(cursor.takeLine(), nil); err != nil {
				return err
			}
			lastLine++
		}
		if lastColumn < current.GeneratedColumn {
			if err := c.emit(cursor.takePrefix(current.GeneratedColumn), nil); err != nil {
				return err
			}
			lastColumn = current.GeneratedColumn
		}
		copy := current
		last = &copy
		return nil
	})
	if err != nil {
		return err
	}
	if !cursor.finished() {
		if last != nil {
			if err := c.emitDecoded(cursor.takeLine(), *last, sourceMap, sources); err != nil {
				return err
			}
		}
		return c.emit(cursor.rest(), nil)
	}
	return nil
}

func (c *composer) emitIndexed(code string, sourceMap *rawMap, relative string) error {
	mappings, err := inflateIndexed(sourceMap)
	if err != nil {
		return err
	}
	sort.SliceStable(mappings, func(i, j int) bool { return compareInflated(mappings[i], mappings[j]) < 0 })
	sources, names := []string{}, []string{}
	sourceIndex, nameIndex := map[string]uint32{}, map[string]uint32{}
	basic := rawMap{}
	encoded := make([]mapping, 0, len(mappings))
	for _, item := range mappings {
		m := mapping{GeneratedLine: item.GeneratedLine, GeneratedColumn: item.GeneratedColumn}
		if item.Source != nil {
			value := *item.Source
			if relative != "" {
				value = joinPath(relative, value)
			}
			index, ok := sourceIndex[value]
			if !ok {
				index = uint32(len(sources))
				sourceIndex[value] = index
				sources = append(sources, value)
			}
			m.Source = index
			m.OriginalLine = *item.OriginalLine
			m.OriginalColumn = *item.OriginalColumn
			m.HasOriginal = true
		}
		if item.Name != nil && *item.Name != "" {
			value := *item.Name
			index, ok := nameIndex[value]
			if !ok {
				index = uint32(len(names))
				nameIndex[value] = index
				names = append(names, value)
			}
			m.Name = index
			m.HasName = true
		}
		encoded = append(encoded, m)
	}
	basic.Names = names
	cursor := newCodeCursor(code)
	var last *mapping
	lastLine, lastColumn := uint32(1), uint32(0)
	for _, current := range encoded {
		if last != nil {
			if lastLine < current.GeneratedLine {
				if err := c.emitDecoded(cursor.takeLine(), *last, &basic, sources); err != nil {
					return err
				}
				lastLine++
				lastColumn = 0
			} else {
				width := current.GeneratedColumn - min(current.GeneratedColumn, lastColumn)
				if err := c.emitDecoded(cursor.takePrefix(width), *last, &basic, sources); err != nil {
					return err
				}
				lastColumn = current.GeneratedColumn
				copy := current
				last = &copy
				continue
			}
		}
		for lastLine < current.GeneratedLine {
			if err := c.emit(cursor.takeLine(), nil); err != nil {
				return err
			}
			lastLine++
		}
		if lastColumn < current.GeneratedColumn {
			if err := c.emit(cursor.takePrefix(current.GeneratedColumn), nil); err != nil {
				return err
			}
			lastColumn = current.GeneratedColumn
		}
		copy := current
		last = &copy
	}
	if !cursor.finished() {
		if last != nil {
			if err := c.emitDecoded(cursor.takeLine(), *last, &basic, sources); err != nil {
				return err
			}
		}
		if err := c.emit(cursor.rest(), nil); err != nil {
			return err
		}
	}
	return visitContents(sourceMap, func(source, content string) error {
		if relative != "" {
			source = joinPath(relative, source)
		}
		return c.smap.setContent(source, content)
	})
}

func (c *composer) emitDecoded(chunk string, m mapping, sourceMap *rawMap, sources []string) error {
	if !m.HasOriginal {
		return c.emit(chunk, nil)
	}
	if int(m.Source) >= len(sources) {
		return errors.New("source index is out of range")
	}
	location := originalLocation{Source: c.smap.internSource(sources[m.Source]), Line: m.OriginalLine, Column: m.OriginalColumn}
	if m.HasName {
		if int(m.Name) >= len(sourceMap.Names) {
			return errors.New("name index is out of range")
		}
		location.Name = c.smap.internName(sourceMap.Names[m.Name])
		location.HasName = true
	}
	return c.emit(chunk, &location)
}

func (c *composer) emit(chunk string, location *originalLocation) error {
	if chunk == "" {
		return nil
	}
	if location != nil && (!c.code.hasActive || c.code.active != *location) {
		if err := c.smap.add(mapping{GeneratedLine: c.code.line, GeneratedColumn: c.code.column, Source: location.Source, OriginalLine: location.Line, OriginalColumn: location.Column, Name: location.Name, HasOriginal: true, HasName: location.HasName}); err != nil {
			return err
		}
		c.code.active = *location
		c.code.hasActive = true
	} else if location == nil && c.code.hasActive {
		if err := c.smap.add(mapping{GeneratedLine: c.code.line, GeneratedColumn: c.code.column}); err != nil {
			return err
		}
		c.code.hasActive = false
	}
	if _, err := c.code.writer.WriteString(chunk); err != nil {
		return err
	}
	c.code.bytes += int64(len(chunk))
	for index, r := range chunk {
		if r == '\n' {
			c.code.line++
			c.code.column = 0
			if index+1 >= len(chunk) {
				c.code.hasActive = false
			} else if c.code.hasActive {
				active := c.code.active
				if err := c.smap.add(mapping{GeneratedLine: c.code.line, GeneratedColumn: 0, Source: active.Source, OriginalLine: active.Line, OriginalColumn: active.Column, Name: active.Name, HasOriginal: true, HasName: active.HasName}); err != nil {
					return err
				}
			}
		} else {
			c.code.column += utf16Width(r)
		}
	}
	return nil
}

func (m *mapOutput) rewrite(source string) string {
	if m.prefix == nil || strings.HasPrefix(source, *m.prefix) {
		return source
	}
	slash := "/"
	if strings.HasPrefix(source, "/") {
		slash = ""
	}
	return *m.prefix + slash + source
}
func (m *mapOutput) internSource(value string) uint32 {
	value = m.rewrite(value)
	if index, ok := m.sourceIndexes[value]; ok {
		return index
	}
	index := uint32(len(m.sources))
	m.sources = append(m.sources, value)
	m.sourceIndexes[value] = index
	return index
}
func (m *mapOutput) internName(value string) uint32 {
	if index, ok := m.nameIndexes[value]; ok {
		return index
	}
	index := uint32(len(m.names))
	m.names = append(m.names, value)
	m.nameIndexes[value] = index
	return index
}
func (m *mapOutput) setContent(source, content string) error {
	source = m.rewrite(source)
	encoded, _ := json.Marshal(content)
	offset := m.contentBytes
	count, err := m.contentWriter.Write(encoded)
	if err != nil {
		return err
	}
	if err = m.contentWriter.Flush(); err != nil {
		return err
	}
	m.contentBytes += int64(count)
	m.contents[source] = contentLocation{offset, int64(count)}
	return nil
}
func (m *mapOutput) add(value mapping) error {
	if len(m.pending) > 0 && (m.pending[0].GeneratedLine != value.GeneratedLine || m.pending[0].GeneratedColumn != value.GeneratedColumn) {
		if err := m.flush(); err != nil {
			return err
		}
	}
	m.pending = append(m.pending, value)
	return nil
}

func (m *mapOutput) flush() error {
	sort.SliceStable(m.pending, func(i, j int) bool { return compareOutput(m.pending[i], m.pending[j], m.sources, m.names) < 0 })
	var previous mapping
	hasPrevious := false
	for _, value := range m.pending {
		if hasPrevious && previous == value {
			continue
		}
		if err := m.encode(value); err != nil {
			return err
		}
		previous = value
		hasPrevious = true
	}
	m.pending = nil
	return nil
}

func (m *mapOutput) encode(value mapping) error {
	if value.GeneratedLine != m.previousLine {
		m.previousColumn = 0
		for m.previousLine < value.GeneratedLine {
			if err := m.mappingWriter.WriteByte(';'); err != nil {
				return err
			}
			m.previousLine++
		}
	} else if m.wrote {
		if err := m.mappingWriter.WriteByte(','); err != nil {
			return err
		}
	}
	writeVLQ(m.mappingWriter, int64(value.GeneratedColumn)-m.previousColumn)
	m.previousColumn = int64(value.GeneratedColumn)
	if value.HasOriginal {
		writeVLQ(m.mappingWriter, int64(value.Source)-m.previousSource)
		m.previousSource = int64(value.Source)
		line := int64(value.OriginalLine) - 1
		writeVLQ(m.mappingWriter, line-m.previousOriginalLine)
		m.previousOriginalLine = line
		column := int64(value.OriginalColumn)
		writeVLQ(m.mappingWriter, column-m.previousOriginalColumn)
		m.previousOriginalColumn = column
		if value.HasName {
			writeVLQ(m.mappingWriter, int64(value.Name)-m.previousName)
			m.previousName = int64(value.Name)
		}
	}
	m.wrote = true
	return nil
}

func (m *mapOutput) finish(outputPath string, file *string) error {
	if err := m.flush(); err != nil {
		return err
	}
	if err := m.mappingWriter.Flush(); err != nil {
		return err
	}
	if err := m.contentWriter.Flush(); err != nil {
		return err
	}
	output, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer output.Close()
	writer := bufio.NewWriter(output)
	writer.WriteString(`{"version":3,"sources":`)
	encoded, _ := json.Marshal(m.sources)
	writer.Write(encoded)
	writer.WriteString(`,"names":`)
	encoded, _ = json.Marshal(m.names)
	writer.Write(encoded)
	writer.WriteString(`,"mappings":"`)
	if _, err = m.mappingFile.Seek(0, 0); err != nil {
		return err
	}
	if _, err = io.Copy(writer, m.mappingFile); err != nil {
		return err
	}
	writer.WriteByte('"')
	if file != nil {
		writer.WriteString(`,"file":`)
		encoded, _ = json.Marshal(*file)
		writer.Write(encoded)
	}
	if len(m.contents) > 0 {
		writer.WriteString(`,"sourcesContent":[`)
		for i, source := range m.sources {
			if i > 0 {
				writer.WriteByte(',')
			}
			location, ok := m.contents[source]
			if !ok {
				writer.WriteString("null")
				continue
			}
			if _, err = m.contentFile.Seek(location.offset, 0); err != nil {
				return err
			}
			if _, err = io.CopyN(writer, m.contentFile, location.length); err != nil {
				return err
			}
		}
		writer.WriteByte(']')
	}
	writer.WriteByte('}')
	return writer.Flush()
}

type codeCursor struct {
	code         string
	lines        []int
	line, offset int
}

func newCodeCursor(code string) *codeCursor {
	lines := []int{0}
	for i := range code {
		if code[i] == '\n' {
			lines = append(lines, i+1)
		}
	}
	return &codeCursor{code: code, lines: lines}
}
func (c *codeCursor) finished() bool { return c.offset >= len(c.code) }
func (c *codeCursor) lineEnd() int {
	if c.line+1 < len(c.lines) {
		return c.lines[c.line+1]
	}
	return len(c.code)
}
func (c *codeCursor) takeLine() string {
	start, end := c.offset, c.lineEnd()
	c.offset = end
	if c.line < len(c.lines) {
		c.line++
	}
	return c.code[start:end]
}
func (c *codeCursor) takePrefix(units uint32) string {
	start, end, used := c.offset, c.lineEnd(), uint32(0)
	for c.offset < end {
		r, size := utf8.DecodeRuneInString(c.code[c.offset:end])
		next := used + utf16Width(r)
		if next > units {
			break
		}
		used = next
		c.offset += size
		if used == units {
			break
		}
	}
	return c.code[start:c.offset]
}
func (c *codeCursor) rest() string { value := c.code[c.offset:]; c.offset = len(c.code); return value }

func decodeMappings(encoded string, callback func(mapping) error) error {
	index, line := 0, uint32(1)
	column, source, originalLine, originalColumn, name := int64(0), int64(0), int64(0), int64(0), int64(0)
	for index < len(encoded) {
		switch encoded[index] {
		case ';':
			line++
			column = 0
			index++
		case ',':
			index++
		default:
			value, err := decodeVLQ(encoded, &index)
			if err != nil {
				return err
			}
			column += value
			if column < 0 {
				return errors.New("generated column is negative")
			}
			m := mapping{GeneratedLine: line, GeneratedColumn: uint32(column)}
			if index < len(encoded) && encoded[index] != ',' && encoded[index] != ';' {
				values := []*int64{&source, &originalLine, &originalColumn}
				for _, target := range values {
					value, err = decodeVLQ(encoded, &index)
					if err != nil {
						return err
					}
					*target += value
					if *target < 0 {
						return errors.New("mapping field is negative")
					}
				}
				m.Source = uint32(source)
				m.OriginalLine = uint32(originalLine + 1)
				m.OriginalColumn = uint32(originalColumn)
				m.HasOriginal = true
				if index < len(encoded) && encoded[index] != ',' && encoded[index] != ';' {
					value, err = decodeVLQ(encoded, &index)
					if err != nil {
						return err
					}
					name += value
					if name < 0 {
						return errors.New("name index is negative")
					}
					m.Name = uint32(name)
					m.HasName = true
				}
			}
			if index < len(encoded) && encoded[index] != ',' && encoded[index] != ';' {
				return errors.New("mapping segment has more than five fields")
			}
			if err := callback(m); err != nil {
				return err
			}
		}
	}
	return nil
}

func decodeVLQ(value string, index *int) (int64, error) {
	var result uint64
	var shift uint
	for {
		if *index >= len(value) {
			return 0, io.ErrUnexpectedEOF
		}
		digit, ok := decode64(value[*index])
		if !ok {
			return 0, errors.New("invalid base64 character")
		}
		*index++
		result |= uint64(digit&31) << shift
		if digit&32 == 0 {
			break
		}
		shift += 5
		if shift > 35 {
			return 0, errors.New("VLQ value exceeds 2**32")
		}
	}
	magnitude := int64(result >> 1)
	if result&1 != 0 {
		return -magnitude, nil
	}
	return magnitude, nil
}
func decode64(value byte) (byte, bool) {
	switch {
	case value >= 'A' && value <= 'Z':
		return value - 'A', true
	case value >= 'a' && value <= 'z':
		return value - 'a' + 26, true
	case value >= '0' && value <= '9':
		return value - '0' + 52, true
	case value == '+':
		return 62, true
	case value == '/':
		return 63, true
	}
	return 0, false
}
func writeVLQ(writer *bufio.Writer, value int64) {
	alphabet := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	var encoded uint64
	if value < 0 {
		encoded = uint64(-value)*2 + 1
	} else {
		encoded = uint64(value) * 2
	}
	for {
		digit := encoded & 31
		encoded >>= 5
		if encoded > 0 {
			digit |= 32
		}
		_ = writer.WriteByte(alphabet[digit])
		if encoded == 0 {
			return
		}
	}
}

func inflateIndexed(sourceMap *rawMap) ([]inflatedMapping, error) {
	output := []inflatedMapping{}
	var lastLine, lastColumn uint32
	for i, section := range sourceMap.Sections {
		if i > 0 && (section.Offset.Line < lastLine || section.Offset.Line == lastLine && section.Offset.Column < lastColumn) {
			return nil, errors.New("section offsets must be ordered and non-overlapping")
		}
		lastLine, lastColumn = section.Offset.Line, section.Offset.Column
		children, err := inflateMappings(&section.Map)
		if err != nil {
			return nil, err
		}
		sectionSource := computeSourceURL(consumerRoot(&section.Map), "")
		for _, item := range children {
			item.GeneratedLine += section.Offset.Line
			if item.GeneratedLine == section.Offset.Line+1 {
				item.GeneratedColumn += section.Offset.Column
			}
			source := sectionSource
			item.Source = &source
			output = append(output, item)
		}
	}
	return output, nil
}
func inflateMappings(sourceMap *rawMap) ([]inflatedMapping, error) {
	if len(sourceMap.Sections) > 0 {
		return inflateIndexed(sourceMap)
	}
	sources := make([]string, len(sourceMap.Sources))
	for i, value := range sourceMap.Sources {
		sources[i] = computeSourceURL(sourceMap.SourceRoot, normalizePath(value))
	}
	output := []inflatedMapping{}
	err := decodeMappings(sourceMap.Mappings, func(m mapping) error {
		item := inflatedMapping{GeneratedLine: m.GeneratedLine, GeneratedColumn: m.GeneratedColumn}
		if m.HasOriginal && int(m.Source) < len(sources) {
			value := sources[m.Source]
			item.Source = &value
			item.OriginalLine = ptr(m.OriginalLine)
			item.OriginalColumn = ptr(m.OriginalColumn)
		}
		if m.HasName && int(m.Name) < len(sourceMap.Names) {
			value := sourceMap.Names[m.Name]
			item.Name = &value
		}
		output = append(output, item)
		return nil
	})
	return output, err
}
func visitContents(sourceMap *rawMap, callback func(string, string) error) error {
	if len(sourceMap.Sections) > 0 {
		for i := range sourceMap.Sections {
			if err := visitContents(&sourceMap.Sections[i].Map, callback); err != nil {
				return err
			}
		}
		return nil
	}
	for i, raw := range sourceMap.SourcesContent {
		if raw != nil && i < len(sourceMap.Sources) {
			var content string
			if err := json.Unmarshal(*raw, &content); err != nil {
				return err
			}
			if err := callback(computeSourceURL(sourceMap.SourceRoot, normalizePath(sourceMap.Sources[i])), content); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateVersion(raw json.RawMessage) error {
	text := string(bytes.TrimSpace(raw))
	if text != "3" && text != `"3"` {
		return fmt.Errorf("unsupported source-map version %s", text)
	}
	return nil
}
func stripXSSI(value []byte) []byte {
	if bytes.HasPrefix(value, []byte(")]}'")) {
		if index := bytes.IndexByte(value, '\n'); index >= 0 {
			return value[index+1:]
		}
	}
	return value
}
func normalizePath(value string) string {
	prefix, rest := splitURL(value)
	absolute, trailing := strings.HasPrefix(rest, "/"), strings.HasSuffix(rest, "/") && len(rest) > 1
	parts := []string{}
	for _, part := range strings.Split(rest, "/") {
		switch {
		case part == "" || part == ".":
		case part == ".." && len(parts) > 0 && parts[len(parts)-1] != "..":
			parts = parts[:len(parts)-1]
		case part == ".." && !absolute:
			parts = append(parts, part)
		case part != "..":
			parts = append(parts, part)
		}
	}
	joined := strings.Join(parts, "/")
	if absolute {
		joined = "/" + joined
	} else if joined == "" {
		joined = "."
	}
	if trailing && joined != "/" && joined != "." {
		joined += "/"
	}
	return prefix + joined
}
func splitURL(value string) (string, string) {
	start := -1
	if index := strings.Index(value, "://"); index >= 0 {
		start = index + 3
	} else if strings.HasPrefix(value, "//") {
		start = 2
	}
	if start < 0 {
		return "", value
	}
	slash := strings.Index(value[start:], "/")
	if slash < 0 {
		return value, ""
	}
	slash += start
	return value[:slash], value[slash:]
}
func joinPath(root, value string) string {
	if strings.HasPrefix(value, "/") || strings.Contains(value, "://") || strings.HasPrefix(value, "data:") {
		return value
	}
	return normalizePath(strings.TrimSuffix(root, "/") + "/" + value)
}
func computeSourceURL(root *string, source string) string {
	if root == nil || *root == "" {
		return normalizePath(source)
	}
	if !strings.HasSuffix(*root, "/") && !strings.HasPrefix(source, "/") {
		return normalizePath(*root + "/" + source)
	}
	return normalizePath(*root + source)
}
func consumerRoot(sourceMap *rawMap) *string {
	if len(sourceMap.Sections) > 0 {
		return nil
	}
	return sourceMap.SourceRoot
}

func validateInput(roots []string, value string) error {
	canonical, err := filepath.EvalSymlinks(value)
	if err != nil {
		return err
	}
	for _, root := range roots {
		if within(root, canonical) {
			return nil
		}
	}
	return fmt.Errorf("input path %s is outside the allowed roots", value)
}
func validateOutput(root, value string) error {
	existing := filepath.Dir(value)
	for {
		if _, err := os.Stat(existing); err == nil {
			break
		}
		parent := filepath.Dir(existing)
		if parent == existing {
			return fmt.Errorf("output path %s has no existing ancestor", value)
		}
		existing = parent
	}
	canonical, err := filepath.EvalSymlinks(existing)
	if err != nil {
		return err
	}
	if !within(root, canonical) {
		return fmt.Errorf("output path %s is outside workspace", value)
	}
	return nil
}
func within(root, value string) bool {
	relative, err := filepath.Rel(root, value)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}
func siblingTemp(value, label string) string {
	return filepath.Join(filepath.Dir(value), fmt.Sprintf(".%s.%s.%d.tmp", filepath.Base(value), label, os.Getpid()))
}
func hashFile(value string) (string, error) {
	file, err := os.Open(value)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err = io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
func ptr[T any](value T) *T { return &value }
func utf16Width(value rune) uint32 {
	if value > 0xffff {
		return 2
	}
	return 1
}
func min(a, b uint32) uint32 {
	if a < b {
		return a
	}
	return b
}
func compareStringPtr(a, b *string) int {
	if a == nil && b == nil {
		return 0
	}
	if a == nil {
		return 1
	}
	if b == nil {
		return -1
	}
	return strings.Compare(*a, *b)
}
func compareInflated(a, b inflatedMapping) int {
	if a.GeneratedLine != b.GeneratedLine {
		if a.GeneratedLine < b.GeneratedLine {
			return -1
		}
		return 1
	}
	if a.GeneratedColumn != b.GeneratedColumn {
		if a.GeneratedColumn < b.GeneratedColumn {
			return -1
		}
		return 1
	}
	if value := compareStringPtr(a.Source, b.Source); value != 0 {
		return value
	}
	return compareStringPtr(a.Name, b.Name)
}
func compareOutput(a, b mapping, sources, names []string) int {
	sourceA, sourceB := (*string)(nil), (*string)(nil)
	if a.HasOriginal {
		sourceA = &sources[a.Source]
	}
	if b.HasOriginal {
		sourceB = &sources[b.Source]
	}
	if value := compareStringPtr(sourceA, sourceB); value != 0 {
		return value
	}
	nameA, nameB := (*string)(nil), (*string)(nil)
	if a.HasName {
		nameA = &names[a.Name]
	}
	if b.HasName {
		nameB = &names[b.Name]
	}
	return compareStringPtr(nameA, nameB)
}
