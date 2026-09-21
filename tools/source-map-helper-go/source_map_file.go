package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"unicode/utf16"
	"unicode/utf8"
)

const sourceMapReadBufferSize = 64 * 1024

type jsonSpan struct {
	offset int64
	length int64
}

type sourceMapDocument struct {
	file *os.File
	root *rawMap
}

func openSourceMap(path string) (*sourceMapDocument, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}

	document := &sourceMapDocument{file: file}
	rootSpan, err := documentSpan(file, info.Size())
	if err != nil {
		document.Close()
		return nil, err
	}
	document.root, err = document.parseRawMap(rootSpan)
	if err != nil {
		document.Close()
		return nil, fmt.Errorf("parsing source map JSON: %w", err)
	}

	return document, nil
}

func (d *sourceMapDocument) Close() error {
	return d.file.Close()
}

func documentSpan(file *os.File, size int64) (jsonSpan, error) {
	prefix := make([]byte, minInt64(size, 256))
	count, err := file.ReadAt(prefix, 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return jsonSpan{}, err
	}
	prefix = prefix[:count]

	offset := int64(0)
	if bytes.HasPrefix(prefix, []byte(")]}'")) {
		newline := bytes.IndexByte(prefix, '\n')
		if newline < 0 {
			return jsonSpan{}, errors.New("unterminated source-map XSSI prefix")
		}
		offset = int64(newline + 1)
	}

	return jsonSpan{offset: offset, length: size - offset}, nil
}

func (d *sourceMapDocument) parseRawMap(span jsonSpan) (*rawMap, error) {
	fields, err := d.parseObjectFields(span)
	if err != nil {
		return nil, err
	}

	result := &rawMap{
		Document: d,
		Sources:  []string{},
		Names:    []string{},
		Sections: []rawSection{},
	}
	if value, ok := fields["version"]; ok {
		if err := d.decodeJSON(value, &result.Version); err != nil {
			return nil, fmt.Errorf("parsing version: %w", err)
		}
	}
	if value, ok := fields["sources"]; ok {
		if err := d.decodeJSON(value, &result.Sources); err != nil {
			return nil, fmt.Errorf("parsing sources: %w", err)
		}
	}
	if value, ok := fields["names"]; ok {
		if err := d.decodeJSON(value, &result.Names); err != nil {
			return nil, fmt.Errorf("parsing names: %w", err)
		}
	}
	if value, ok := fields["sourceRoot"]; ok {
		if err := d.decodeJSON(value, &result.SourceRoot); err != nil {
			return nil, fmt.Errorf("parsing sourceRoot: %w", err)
		}
	}
	if value, ok := fields["mappings"]; ok {
		result.Mappings = value
	}
	if value, ok := fields["sourcesContent"]; ok {
		result.SourcesContent, err = d.parseArrayValues(value)
		if err != nil {
			return nil, fmt.Errorf("parsing sourcesContent: %w", err)
		}
	}
	if value, ok := fields["sections"]; ok {
		sections, err := d.parseArrayValues(value)
		if err != nil {
			return nil, fmt.Errorf("parsing sections: %w", err)
		}
		for _, sectionSpan := range sections {
			sectionFields, err := d.parseObjectFields(sectionSpan)
			if err != nil {
				return nil, err
			}
			var offset rawOffset
			if err := d.decodeJSON(sectionFields["offset"], &offset); err != nil {
				return nil, fmt.Errorf("parsing section offset: %w", err)
			}
			sectionMap, err := d.parseRawMap(sectionFields["map"])
			if err != nil {
				return nil, fmt.Errorf("parsing section map: %w", err)
			}
			result.Sections = append(result.Sections, rawSection{Offset: offset, Map: *sectionMap})
		}
	}

	return result, nil
}

func (d *sourceMapDocument) decodeJSON(span jsonSpan, destination any) error {
	reader := io.NewSectionReader(d.file, span.offset, span.length)
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return errors.New("unexpected data after JSON value")
	}
	return nil
}

func (d *sourceMapDocument) readOptionalString(span jsonSpan) (string, bool, error) {
	reader := io.NewSectionReader(d.file, span.offset, span.length)
	decoder := json.NewDecoder(reader)
	var value *string
	if err := decoder.Decode(&value); err != nil {
		return "", false, err
	}
	if value == nil {
		return "", false, nil
	}
	return *value, true, nil
}

func (d *sourceMapDocument) stringReader(span jsonSpan) (io.ByteReader, error) {
	// Missing mappings are equivalent to an empty mapping string in the
	// existing helper behavior.
	if span.length == 0 {
		return bytes.NewReader(nil), nil
	}
	if span.length < 2 {
		return nil, errors.New("expected JSON string")
	}
	var delimiters [2]byte
	if _, err := d.file.ReadAt(delimiters[:1], span.offset); err != nil {
		return nil, err
	}
	if _, err := d.file.ReadAt(delimiters[1:], span.offset+span.length-1); err != nil {
		return nil, err
	}
	if delimiters[0] != '"' || delimiters[1] != '"' {
		return nil, errors.New("expected JSON string")
	}

	contents := io.NewSectionReader(d.file, span.offset+1, span.length-2)
	return &jsonStringReader{reader: bufio.NewReaderSize(contents, sourceMapReadBufferSize)}, nil
}

func (d *sourceMapDocument) parseObjectFields(span jsonSpan) (map[string]jsonSpan, error) {
	scanner := newJSONFileScanner(d.file, span)
	if err := scanner.expect('{'); err != nil {
		return nil, errors.New("expected JSON object")
	}
	fields := make(map[string]jsonSpan)

	for {
		if err := scanner.skipSpace(); err != nil {
			return nil, err
		}
		value, err := scanner.peek()
		if err != nil {
			return nil, err
		}
		if value == '}' {
			scanner.consume()
			return fields, scanner.finish()
		}

		keySpan, err := scanner.scanValue()
		if err != nil {
			return nil, err
		}
		var key string
		if err := d.decodeJSON(keySpan, &key); err != nil {
			return nil, err
		}
		if err := scanner.skipSpace(); err != nil {
			return nil, err
		}
		if err := scanner.expect(':'); err != nil {
			return nil, errors.New("expected colon after JSON object key")
		}
		if err := scanner.skipSpace(); err != nil {
			return nil, err
		}
		valueSpan, err := scanner.scanValue()
		if err != nil {
			return nil, err
		}
		fields[key] = valueSpan

		if err := scanner.skipSpace(); err != nil {
			return nil, err
		}
		delimiter, err := scanner.consume()
		if err != nil {
			return nil, err
		}
		switch delimiter {
		case ',':
			continue
		case '}':
			return fields, scanner.finish()
		default:
			return nil, errors.New("expected comma or end of JSON object")
		}
	}
}

func (d *sourceMapDocument) parseArrayValues(span jsonSpan) ([]jsonSpan, error) {
	scanner := newJSONFileScanner(d.file, span)
	if err := scanner.expect('['); err != nil {
		return nil, errors.New("expected JSON array")
	}
	values := []jsonSpan{}

	for {
		if err := scanner.skipSpace(); err != nil {
			return nil, err
		}
		value, err := scanner.peek()
		if err != nil {
			return nil, err
		}
		if value == ']' {
			scanner.consume()
			return values, scanner.finish()
		}

		valueSpan, err := scanner.scanValue()
		if err != nil {
			return nil, err
		}
		values = append(values, valueSpan)
		if err := scanner.skipSpace(); err != nil {
			return nil, err
		}
		delimiter, err := scanner.consume()
		if err != nil {
			return nil, err
		}
		switch delimiter {
		case ',':
			continue
		case ']':
			return values, scanner.finish()
		default:
			return nil, errors.New("expected comma or end of JSON array")
		}
	}
}

type jsonFileScanner struct {
	reader   *bufio.Reader
	base     int64
	position int64
	length   int64
}

func newJSONFileScanner(file *os.File, span jsonSpan) *jsonFileScanner {
	section := io.NewSectionReader(file, span.offset, span.length)
	return &jsonFileScanner{
		reader: bufio.NewReaderSize(section, sourceMapReadBufferSize),
		base:   span.offset,
		length: span.length,
	}
}

func (s *jsonFileScanner) peek() (byte, error) {
	value, err := s.reader.Peek(1)
	if err != nil {
		return 0, err
	}
	return value[0], nil
}

func (s *jsonFileScanner) consume() (byte, error) {
	value, err := s.reader.ReadByte()
	if err != nil {
		return 0, err
	}
	s.position++
	return value, nil
}

func (s *jsonFileScanner) expect(expected byte) error {
	value, err := s.consume()
	if err != nil {
		return err
	}
	if value != expected {
		return fmt.Errorf("expected %q", expected)
	}
	return nil
}

func (s *jsonFileScanner) skipSpace() error {
	for {
		value, err := s.peek()
		if err != nil {
			return err
		}
		switch value {
		case ' ', '\t', '\r', '\n':
			s.consume()
		default:
			return nil
		}
	}
}

func (s *jsonFileScanner) scanValue() (jsonSpan, error) {
	start := s.base + s.position
	value, err := s.peek()
	if err != nil {
		return jsonSpan{}, err
	}

	switch value {
	case '"':
		err = s.scanString()
	case '{', '[':
		err = s.scanComposite()
	default:
		for {
			value, nextErr := s.peek()
			if nextErr != nil {
				if errors.Is(nextErr, io.EOF) {
					break
				}
				err = nextErr
				break
			}
			if isJSONValueDelimiter(value) {
				break
			}
			s.consume()
		}
	}
	if err != nil {
		return jsonSpan{}, err
	}

	return jsonSpan{offset: start, length: s.base + s.position - start}, nil
}

func (s *jsonFileScanner) scanString() error {
	if err := s.expect('"'); err != nil {
		return err
	}
	for {
		value, err := s.consume()
		if err != nil {
			return err
		}
		switch value {
		case '\\':
			if _, err := s.consume(); err != nil {
				return err
			}
		case '"':
			return nil
		}
	}
}

func (s *jsonFileScanner) scanComposite() error {
	opening, err := s.consume()
	if err != nil {
		return err
	}
	stack := []byte{opening}
	for len(stack) > 0 {
		value, err := s.consume()
		if err != nil {
			return err
		}
		switch value {
		case '"':
			if err := s.scanStringBody(); err != nil {
				return err
			}
		case '{', '[':
			stack = append(stack, value)
		case '}', ']':
			expected := byte('{')
			if value == ']' {
				expected = '['
			}
			if stack[len(stack)-1] != expected {
				return errors.New("mismatched JSON delimiter")
			}
			stack = stack[:len(stack)-1]
		}
	}
	return nil
}

func (s *jsonFileScanner) scanStringBody() error {
	for {
		value, err := s.consume()
		if err != nil {
			return err
		}
		switch value {
		case '\\':
			if _, err := s.consume(); err != nil {
				return err
			}
		case '"':
			return nil
		}
	}
}

func (s *jsonFileScanner) finish() error {
	for s.position < s.length {
		value, err := s.consume()
		if err != nil {
			return err
		}
		switch value {
		case ' ', '\t', '\r', '\n':
		default:
			return errors.New("unexpected data after JSON value")
		}
	}
	return nil
}

type jsonStringReader struct {
	reader       *bufio.Reader
	pending      [utf8.UTFMax]byte
	pendingIndex int
	pendingEnd   int
}

func (r *jsonStringReader) ReadByte() (byte, error) {
	if r.pendingIndex < r.pendingEnd {
		value := r.pending[r.pendingIndex]
		r.pendingIndex++
		return value, nil
	}

	value, err := r.reader.ReadByte()
	if err != nil || value != '\\' {
		if value < 0x20 && err == nil {
			return 0, errors.New("unescaped control character in JSON string")
		}
		return value, err
	}

	escaped, err := r.reader.ReadByte()
	if err != nil {
		return 0, err
	}
	switch escaped {
	case '"', '\\', '/':
		return escaped, nil
	case 'b':
		return '\b', nil
	case 'f':
		return '\f', nil
	case 'n':
		return '\n', nil
	case 'r':
		return '\r', nil
	case 't':
		return '\t', nil
	case 'u':
		decoded, err := r.readUnicodeEscape()
		if err != nil {
			return 0, err
		}
		r.pendingEnd = utf8.EncodeRune(r.pending[:], decoded)
		r.pendingIndex = 1
		return r.pending[0], nil
	default:
		return 0, errors.New("invalid JSON string escape")
	}
}

func (r *jsonStringReader) readUnicodeEscape() (rune, error) {
	first, err := r.readHexRune()
	if err != nil {
		return 0, err
	}
	if !utf16.IsSurrogate(first) {
		return first, nil
	}

	prefix := make([]byte, 2)
	if _, err := io.ReadFull(r.reader, prefix); err != nil {
		return 0, err
	}
	if prefix[0] != '\\' || prefix[1] != 'u' {
		return 0, errors.New("invalid JSON surrogate pair")
	}
	second, err := r.readHexRune()
	if err != nil {
		return 0, err
	}
	decoded := utf16.DecodeRune(first, second)
	if decoded == utf8.RuneError {
		return 0, errors.New("invalid JSON surrogate pair")
	}
	return decoded, nil
}

func (r *jsonStringReader) readHexRune() (rune, error) {
	var value rune
	for range 4 {
		digit, err := r.reader.ReadByte()
		if err != nil {
			return 0, err
		}
		value <<= 4
		switch {
		case digit >= '0' && digit <= '9':
			value += rune(digit - '0')
		case digit >= 'a' && digit <= 'f':
			value += rune(digit-'a') + 10
		case digit >= 'A' && digit <= 'F':
			value += rune(digit-'A') + 10
		default:
			return 0, errors.New("invalid JSON Unicode escape")
		}
	}
	return value, nil
}

func minInt64(a, b int64) int {
	if a < b {
		return int(a)
	}
	return int(b)
}
