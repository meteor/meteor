use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Cursor, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use memchr::{memchr, memchr2, memchr3};
use serde::de::DeserializeOwned;

use crate::{RawOffset, RawSection, RawSourceMap};

const READ_BUFFER_SIZE: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct JsonSpan {
    pub(crate) offset: u64,
    pub(crate) length: u64,
}

pub(crate) struct SourceMapDocument {
    path: PathBuf,
    pub(crate) root: RawSourceMap,
}

impl SourceMapDocument {
    pub(crate) fn open(path: &Path) -> Result<Self> {
        let file = File::open(path)?;
        let span = document_span(file)?;
        let mut document = Self {
            path: path.to_owned(),
            root: RawSourceMap::default(),
        };
        document.root = document
            .parse_raw_map(span)
            .context("parsing source map JSON")?;
        Ok(document)
    }

    pub(crate) fn read_optional_string(&self, span: JsonSpan) -> Result<Option<String>> {
        self.decode_json(span)
    }

    pub(crate) fn mapping_reader(&self, span: Option<JsonSpan>) -> Result<MappingReader> {
        let Some(span) = span else {
            return Ok(MappingReader::Empty(Cursor::new(Vec::new())));
        };
        if span.length < 2 {
            bail!("expected JSON string");
        }

        let mut file = File::open(&self.path)?;
        let mut delimiters = [0_u8; 2];
        file.seek(SeekFrom::Start(span.offset))?;
        file.read_exact(&mut delimiters[..1])?;
        file.seek(SeekFrom::Start(span.offset + span.length - 1))?;
        file.read_exact(&mut delimiters[1..])?;
        if delimiters != *b"\"\"" {
            bail!("expected JSON string");
        }

        let contents = JsonSpan {
            offset: span.offset + 1,
            length: span.length - 2,
        };
        file.seek(SeekFrom::Start(contents.offset))?;
        if span_contains_byte(&mut file, contents.length, b'\\')? {
            file.seek(SeekFrom::Start(contents.offset))?;
            Ok(MappingReader::Escaped(JsonStringBytes::new(Box::new(
                file.take(contents.length),
            ))))
        } else {
            file.seek(SeekFrom::Start(contents.offset))?;
            Ok(MappingReader::Plain(file.take(contents.length)))
        }
    }

    fn parse_raw_map(&self, span: JsonSpan) -> Result<RawSourceMap> {
        let fields = self.parse_object_fields(span)?;
        let mut result = RawSourceMap::default();

        if let Some(span) = fields.get("version") {
            result.version = self.decode_json(*span)?;
        }
        if let Some(span) = fields.get("sources") {
            result.sources = self.decode_json(*span).context("parsing sources")?;
        }
        if let Some(span) = fields.get("names") {
            result.names = self.decode_json(*span).context("parsing names")?;
        }
        if let Some(span) = fields.get("sourceRoot") {
            result.source_root = self.decode_json(*span).context("parsing sourceRoot")?;
        }
        result.mappings = fields.get("mappings").copied();
        if let Some(span) = fields.get("sourcesContent") {
            result.sources_content = self
                .parse_array_values(*span)
                .context("parsing sourcesContent")?;
        }
        if let Some(span) = fields.get("sections") {
            for section_span in self.parse_array_values(*span).context("parsing sections")? {
                let fields = self.parse_object_fields(section_span)?;
                let offset_span = fields
                    .get("offset")
                    .copied()
                    .ok_or_else(|| anyhow!("section is missing offset"))?;
                let map_span = fields
                    .get("map")
                    .copied()
                    .ok_or_else(|| anyhow!("section is missing map"))?;
                let offset: RawOffset = self
                    .decode_json(offset_span)
                    .context("parsing section offset")?;
                let map = self
                    .parse_raw_map(map_span)
                    .context("parsing section map")?;
                result.sections.push(RawSection {
                    offset,
                    map: Box::new(map),
                });
            }
        }

        Ok(result)
    }

    fn decode_json<T>(&self, span: JsonSpan) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let mut file = File::open(&self.path)?;
        file.seek(SeekFrom::Start(span.offset))?;
        let reader = BufReader::with_capacity(READ_BUFFER_SIZE, file.take(span.length));
        let mut deserializer = serde_json::Deserializer::from_reader(reader);
        let value = T::deserialize(&mut deserializer)?;
        deserializer.end()?;
        Ok(value)
    }

    fn parse_object_fields(&self, span: JsonSpan) -> Result<HashMap<String, JsonSpan>> {
        let mut scanner = JsonFileScanner::new(&self.path, span)?;
        scanner.expect(b'{').context("expected JSON object")?;
        let mut fields = HashMap::new();

        loop {
            scanner.skip_space()?;
            if scanner.peek()? == b'}' {
                scanner.consume()?;
                scanner.finish()?;
                return Ok(fields);
            }

            let key_span = scanner.scan_value()?;
            let key: String = self.decode_json(key_span)?;
            scanner.skip_space()?;
            scanner
                .expect(b':')
                .context("expected colon after JSON object key")?;
            scanner.skip_space()?;
            let value_span = scanner.scan_value()?;
            fields.insert(key, value_span);

            scanner.skip_space()?;
            match scanner.consume()? {
                b',' => {}
                b'}' => {
                    scanner.finish()?;
                    return Ok(fields);
                }
                _ => bail!("expected comma or end of JSON object"),
            }
        }
    }

    fn parse_array_values(&self, span: JsonSpan) -> Result<Vec<JsonSpan>> {
        let mut scanner = JsonFileScanner::new(&self.path, span)?;
        scanner.expect(b'[').context("expected JSON array")?;
        let mut values = Vec::new();

        loop {
            scanner.skip_space()?;
            if scanner.peek()? == b']' {
                scanner.consume()?;
                scanner.finish()?;
                return Ok(values);
            }

            values.push(scanner.scan_value()?);
            scanner.skip_space()?;
            match scanner.consume()? {
                b',' => {}
                b']' => {
                    scanner.finish()?;
                    return Ok(values);
                }
                _ => bail!("expected comma or end of JSON array"),
            }
        }
    }
}

fn document_span(mut file: File) -> Result<JsonSpan> {
    let length = file.metadata()?.len();
    let mut prefix = vec![0_u8; length.min(256) as usize];
    file.read_exact(&mut prefix)?;

    let offset = if prefix.starts_with(b")]}'") {
        prefix
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|index| index as u64 + 1)
            .ok_or_else(|| anyhow!("unterminated source-map XSSI prefix"))?
    } else {
        0
    };

    Ok(JsonSpan {
        offset,
        length: length - offset,
    })
}

struct JsonFileScanner {
    reader: BufReader<io::Take<File>>,
    base: u64,
    position: u64,
    length: u64,
}

impl JsonFileScanner {
    fn new(path: &Path, span: JsonSpan) -> Result<Self> {
        let mut file = File::open(path)?;
        file.seek(SeekFrom::Start(span.offset))?;
        Ok(Self {
            reader: BufReader::with_capacity(READ_BUFFER_SIZE, file.take(span.length)),
            base: span.offset,
            position: 0,
            length: span.length,
        })
    }

    fn peek(&mut self) -> Result<u8> {
        self.reader
            .fill_buf()?
            .first()
            .copied()
            .ok_or_else(|| anyhow!("unexpected end of JSON input"))
    }

    fn consume(&mut self) -> Result<u8> {
        let value = self.peek()?;
        self.reader.consume(1);
        self.position += 1;
        Ok(value)
    }

    fn expect(&mut self, expected: u8) -> Result<()> {
        let value = self.consume()?;
        if value != expected {
            bail!("expected {:?}", expected as char);
        }
        Ok(())
    }

    fn skip_space(&mut self) -> Result<()> {
        while matches!(self.peek()?, b' ' | b'\t' | b'\r' | b'\n') {
            self.consume()?;
        }
        Ok(())
    }

    fn scan_value(&mut self) -> Result<JsonSpan> {
        let start = self.base + self.position;
        match self.peek()? {
            b'"' => self.scan_string()?,
            b'{' | b'[' => self.scan_composite()?,
            _ => {
                while self.position < self.length {
                    let value = self.peek()?;
                    if is_value_delimiter(value) {
                        break;
                    }
                    self.consume()?;
                }
            }
        }
        let length = self.base + self.position - start;
        if length == 0 {
            bail!("expected JSON value");
        }
        Ok(JsonSpan {
            offset: start,
            length,
        })
    }

    fn scan_string(&mut self) -> Result<()> {
        self.expect(b'"')?;
        self.scan_string_body()
    }

    fn scan_string_body(&mut self) -> Result<()> {
        loop {
            let (plain_bytes, special) = {
                let buffer = self.reader.fill_buf()?;
                if buffer.is_empty() {
                    bail!("unexpected end of JSON string");
                }
                match memchr2(b'\\', b'"', buffer) {
                    Some(index) => (index, Some(buffer[index])),
                    None => (buffer.len(), None),
                }
            };
            self.reader.consume(plain_bytes);
            self.position += plain_bytes as u64;

            let Some(special) = special else {
                continue;
            };
            self.consume()?;
            match special {
                b'\\' => {
                    self.consume()?;
                }
                b'"' => return Ok(()),
                _ => {}
            }
        }
    }

    fn scan_composite(&mut self) -> Result<()> {
        let opening = self.consume()?;
        let mut stack = vec![opening];
        while !stack.is_empty() {
            let (plain_bytes, special) = {
                let buffer = self.reader.fill_buf()?;
                if buffer.is_empty() {
                    bail!("unexpected end of JSON input");
                }
                let first = memchr3(b'"', b'{', b'[', buffer);
                let second = memchr2(b'}', b']', buffer);
                match first.into_iter().chain(second).min() {
                    Some(index) => (index, Some(buffer[index])),
                    None => (buffer.len(), None),
                }
            };
            self.reader.consume(plain_bytes);
            self.position += plain_bytes as u64;

            let Some(special) = special else {
                continue;
            };
            self.consume()?;
            match special {
                b'"' => self.scan_string_body()?,
                value @ (b'{' | b'[') => stack.push(value),
                value @ (b'}' | b']') => {
                    let expected = if value == b'}' { b'{' } else { b'[' };
                    if stack.last().copied() != Some(expected) {
                        bail!("mismatched JSON delimiter");
                    }
                    stack.pop();
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn finish(&mut self) -> Result<()> {
        while self.position < self.length {
            if !matches!(self.consume()?, b' ' | b'\t' | b'\r' | b'\n') {
                bail!("unexpected data after JSON value");
            }
        }
        Ok(())
    }
}

fn is_value_delimiter(value: u8) -> bool {
    matches!(value, b',' | b']' | b'}' | b' ' | b'\t' | b'\r' | b'\n')
}

fn span_contains_byte(file: &mut File, length: u64, needle: u8) -> io::Result<bool> {
    let mut reader = file.take(length);
    let mut buffer = [0_u8; READ_BUFFER_SIZE];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            return Ok(false);
        }
        if memchr(needle, &buffer[..count]).is_some() {
            return Ok(true);
        }
    }
}

pub(crate) enum MappingReader {
    Empty(Cursor<Vec<u8>>),
    Plain(io::Take<File>),
    Escaped(JsonStringBytes),
}

impl Read for MappingReader {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        match self {
            Self::Empty(reader) => reader.read(buffer),
            Self::Plain(reader) => reader.read(buffer),
            Self::Escaped(reader) => reader.read(buffer),
        }
    }
}

pub(crate) struct JsonStringBytes {
    reader: BufReader<Box<dyn Read>>,
    pending: [u8; 4],
    pending_index: usize,
    pending_end: usize,
}

impl JsonStringBytes {
    fn new(reader: Box<dyn Read>) -> Self {
        Self {
            reader: BufReader::with_capacity(READ_BUFFER_SIZE, reader),
            pending: [0; 4],
            pending_index: 0,
            pending_end: 0,
        }
    }

    fn read_raw_byte(&mut self) -> Result<Option<u8>> {
        let mut byte = [0_u8; 1];
        match self.reader.read(&mut byte)? {
            0 => Ok(None),
            _ => Ok(Some(byte[0])),
        }
    }

    fn read_required_byte(&mut self) -> Result<u8> {
        self.read_raw_byte()?
            .ok_or_else(|| anyhow!("unexpected end of JSON string"))
    }

    fn read_hex_u16(&mut self) -> Result<u16> {
        let mut value = 0_u16;
        for _ in 0..4 {
            value <<= 4;
            value += match self.read_required_byte()? {
                digit @ b'0'..=b'9' => u16::from(digit - b'0'),
                digit @ b'a'..=b'f' => u16::from(digit - b'a') + 10,
                digit @ b'A'..=b'F' => u16::from(digit - b'A') + 10,
                _ => bail!("invalid JSON Unicode escape"),
            };
        }
        Ok(value)
    }

    fn read_unicode_escape(&mut self) -> Result<char> {
        let first = self.read_hex_u16()?;
        let codepoint = if (0xD800..=0xDBFF).contains(&first) {
            if self.read_required_byte()? != b'\\' || self.read_required_byte()? != b'u' {
                bail!("invalid JSON surrogate pair");
            }
            let second = self.read_hex_u16()?;
            if !(0xDC00..=0xDFFF).contains(&second) {
                bail!("invalid JSON surrogate pair");
            }
            0x10000 + ((u32::from(first) - 0xD800) << 10) + (u32::from(second) - 0xDC00)
        } else if (0xDC00..=0xDFFF).contains(&first) {
            bail!("invalid JSON surrogate pair");
        } else {
            u32::from(first)
        };
        char::from_u32(codepoint).ok_or_else(|| anyhow!("invalid JSON Unicode escape"))
    }

    fn next_byte(&mut self) -> Result<Option<u8>> {
        if self.pending_index < self.pending_end {
            let value = self.pending[self.pending_index];
            self.pending_index += 1;
            return Ok(Some(value));
        }

        let Some(value) = self.read_raw_byte()? else {
            return Ok(None);
        };
        if value < 0x20 {
            bail!("unescaped control character in JSON string");
        }
        if value != b'\\' {
            return Ok(Some(value));
        }

        let escaped = match self.read_required_byte()? {
            value @ (b'"' | b'\\' | b'/') => value,
            b'b' => 0x08,
            b'f' => 0x0c,
            b'n' => b'\n',
            b'r' => b'\r',
            b't' => b'\t',
            b'u' => {
                let character = self.read_unicode_escape()?;
                self.pending_end = character.encode_utf8(&mut self.pending).len();
                self.pending_index = 1;
                return Ok(Some(self.pending[0]));
            }
            _ => bail!("invalid JSON string escape"),
        };
        Ok(Some(escaped))
    }
}

impl Read for JsonStringBytes {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let mut written = 0;
        while written < buffer.len() {
            match self.next_byte().map_err(io::Error::other)? {
                Some(value) => {
                    buffer[written] = value;
                    written += 1;
                }
                None => break,
            }
        }
        Ok(written)
    }
}
