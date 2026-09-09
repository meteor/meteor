use std::borrow::Cow;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow, bail};
use memmap2::Mmap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub protocol_version: u32,
    pub workspace_root: PathBuf,
    pub output: OutputRequest,
    pub pieces: Vec<Piece>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputRequest {
    pub code_path: PathBuf,
    pub map_path: PathBuf,
    #[serde(default)]
    pub file: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Piece {
    Literal {
        value: String,
    },
    Mapped {
        code_path: PathBuf,
        map_path: PathBuf,
        #[serde(default)]
        relative_path: Option<String>,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub protocol_version: u32,
    pub success: bool,
    pub code_path: PathBuf,
    pub map_path: PathBuf,
    pub code_bytes: u64,
    pub map_bytes: u64,
    pub code_sha256: String,
    pub map_sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSourceMap<'a> {
    version: serde_json::Value,
    #[serde(default, borrow)]
    sources: Vec<Cow<'a, str>>,
    #[serde(default, borrow)]
    names: Vec<Cow<'a, str>>,
    #[serde(default, borrow)]
    source_root: Option<Cow<'a, str>>,
    #[serde(default, borrow)]
    sources_content: Option<Vec<Option<Cow<'a, str>>>>,
    #[serde(default, borrow)]
    mappings: Cow<'a, str>,
    #[serde(default, borrow)]
    sections: Vec<RawSection<'a>>,
}

#[derive(Debug, Deserialize)]
struct RawSection<'a> {
    offset: RawOffset,
    #[serde(borrow)]
    map: Box<RawSourceMap<'a>>,
}

#[derive(Debug, Deserialize)]
struct RawOffset {
    line: u32,
    column: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct DecodedMapping {
    generated_line: u32,
    generated_column: u32,
    source: Option<u32>,
    original_line: Option<u32>,
    original_column: Option<u32>,
    name: Option<u32>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct OutputMapping {
    generated_line: u32,
    generated_column: u32,
    source: Option<u32>,
    original_line: Option<u32>,
    original_column: Option<u32>,
    name: Option<u32>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct OriginalLocation {
    source: u32,
    line: u32,
    column: u32,
    name: Option<u32>,
}

struct MappedInput<'a> {
    map: RawSourceMap<'a>,
    sources: Vec<String>,
}

#[derive(Clone, Debug)]
struct InflatedMapping {
    generated_line: u32,
    generated_column: u32,
    source: Option<String>,
    original_line: Option<u32>,
    original_column: Option<u32>,
    name: Option<String>,
}

struct OutputMap {
    mapping_path: PathBuf,
    mapping_writer: BufWriter<File>,
    sources: Vec<String>,
    source_indexes: HashMap<String, u32>,
    names: Vec<String>,
    name_indexes: HashMap<String, u32>,
    source_contents: HashMap<String, String>,
    pending: Vec<OutputMapping>,
    previous_generated_line: u32,
    previous_generated_column: i64,
    previous_original_line: i64,
    previous_original_column: i64,
    previous_source: i64,
    previous_name: i64,
    wrote_mapping: bool,
}

struct OutputCode {
    writer: BufWriter<File>,
    hasher: Sha256,
    bytes: u64,
    line: u32,
    column: u32,
    active_original: Option<OriginalLocation>,
}

struct Composer {
    code: OutputCode,
    map: OutputMap,
}

struct MappedCodeState<'a> {
    cursor: CodeCursor<'a>,
    last_generated_line: u32,
    last_generated_column: u32,
    last_mapping: Option<DecodedMapping>,
}

impl<'a> MappedCodeState<'a> {
    fn new(code: &'a str) -> Self {
        Self {
            cursor: CodeCursor::new(code),
            last_generated_line: 1,
            last_generated_column: 0,
            last_mapping: None,
        }
    }
}

pub fn execute(request: Request) -> Result<Response> {
    if request.protocol_version != PROTOCOL_VERSION {
        bail!(
            "unsupported protocol version {}; expected {PROTOCOL_VERSION}",
            request.protocol_version
        );
    }

    let root = request.workspace_root.canonicalize().with_context(|| {
        format!(
            "resolving workspace root {}",
            request.workspace_root.display()
        )
    })?;

    validate_output_path(&root, &request.output.code_path)?;
    validate_output_path(&root, &request.output.map_path)?;

    if let Some(parent) = request.output.code_path.parent() {
        fs::create_dir_all(parent)?;
    }
    if let Some(parent) = request.output.map_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mapping_path = sibling_temporary_path(&request.output.map_path, "mappings");
    let code_file = File::create(&request.output.code_path)
        .with_context(|| format!("creating {}", request.output.code_path.display()))?;
    let mut composer = Composer {
        code: OutputCode {
            writer: BufWriter::new(code_file),
            hasher: Sha256::new(),
            bytes: 0,
            line: 1,
            column: 0,
            active_original: None,
        },
        map: OutputMap::new(mapping_path.clone())?,
    };

    let result = (|| -> Result<()> {
        for piece in request.pieces {
            match piece {
                Piece::Literal { value } => composer.emit(&value, None)?,
                Piece::Mapped {
                    code_path,
                    map_path,
                    relative_path,
                } => {
                    validate_input_path(&root, &code_path)?;
                    validate_input_path(&root, &map_path)?;
                    composer.emit_mapped_file(&code_path, &map_path, relative_path.as_deref())?;
                }
            }
        }

        composer.code.writer.flush()?;
        composer
            .map
            .finish(&request.output.map_path, request.output.file.as_deref())?;
        Ok(())
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&request.output.code_path);
        let _ = fs::remove_file(&request.output.map_path);
        let _ = fs::remove_file(&mapping_path);
        return Err(error);
    }

    let code_sha256 = hex_digest(composer.code.hasher.finalize());
    let code_bytes = composer.code.bytes;
    let map_bytes = fs::metadata(&request.output.map_path)?.len();
    let map_sha256 = hash_file(&request.output.map_path)?;

    Ok(Response {
        protocol_version: PROTOCOL_VERSION,
        success: true,
        code_path: request.output.code_path,
        map_path: request.output.map_path,
        code_bytes,
        map_bytes,
        code_sha256,
        map_sha256,
    })
}

impl Composer {
    fn emit_mapped_file(
        &mut self,
        code_path: &Path,
        map_path: &Path,
        relative_path: Option<&str>,
    ) -> Result<()> {
        let code_file = File::open(code_path)?;
        let code_mmap = unsafe { Mmap::map(&code_file)? };
        let code = std::str::from_utf8(&code_mmap).context("mapped code is not UTF-8")?;

        let map_file = File::open(map_path)?;
        let map_mmap = unsafe { Mmap::map(&map_file)? };
        let map_text = std::str::from_utf8(&map_mmap).context("source map is not UTF-8")?;
        let map_text = strip_xssi_prefix(map_text);
        let raw: RawSourceMap<'_> =
            serde_json::from_str(map_text).context("parsing source map JSON")?;

        validate_version(&raw.version)?;
        if raw.sections.is_empty() {
            let mut sources = Vec::with_capacity(raw.sources.len());
            for source in &raw.sources {
                let normalized = normalize_path(source);
                let resolved = compute_source_url(raw.source_root.as_deref(), &normalized);
                sources.push(match relative_path {
                    Some(base) => join_path(base, &resolved),
                    None => resolved,
                });
            }

            let input = MappedInput { map: raw, sources };
            self.emit_basic_map(code, &input)?;

            if let Some(contents) = &input.map.sources_content {
                for (index, source) in input.sources.iter().enumerate() {
                    if let Some(Some(content)) = contents.get(index) {
                        self.map.set_source_content(source, content);
                    }
                }
            }
        } else {
            self.emit_indexed_map(code, &raw, relative_path)?;
        }

        Ok(())
    }

    fn emit_indexed_map(
        &mut self,
        code: &str,
        map: &RawSourceMap<'_>,
        relative_path: Option<&str>,
    ) -> Result<()> {
        let mut mappings = inflate_indexed_mappings(map)?;
        mappings.sort_by(compare_inflated_mappings);

        let mut sources = Vec::<String>::new();
        let mut source_indexes = HashMap::<String, u32>::new();
        let mut names = Vec::<Cow<'_, str>>::new();
        let mut name_indexes = HashMap::<String, u32>::new();
        let mut decoded = Vec::with_capacity(mappings.len());

        for mapping in &mappings {
            let source = mapping.source.as_ref().map(|value| {
                let value = match relative_path {
                    Some(base) => join_path(base, value),
                    None => value.clone(),
                };
                *source_indexes.entry(value.clone()).or_insert_with(|| {
                    let index = sources.len() as u32;
                    sources.push(value);
                    index
                })
            });
            let name = mapping.name.as_ref().map(|value| {
                *name_indexes.entry(value.clone()).or_insert_with(|| {
                    let index = names.len() as u32;
                    names.push(Cow::Owned(value.clone()));
                    index
                })
            });
            decoded.push(DecodedMapping {
                generated_line: mapping.generated_line,
                generated_column: mapping.generated_column,
                source,
                original_line: mapping.original_line,
                original_column: mapping.original_column,
                name,
            });
        }

        let synthetic = RawSourceMap {
            version: serde_json::Value::from(3),
            sources: Vec::new(),
            names,
            source_root: None,
            sources_content: None,
            mappings: Cow::Borrowed(""),
            sections: Vec::new(),
        };
        let input = MappedInput {
            map: synthetic,
            sources,
        };
        let mut state = MappedCodeState::new(code);
        for mapping in decoded {
            self.emit_decoded_mapping(&mut state, mapping, &input)?;
        }
        self.finish_decoded_map(&mut state, &input)?;

        let mut contents = Vec::new();
        collect_source_contents(map, &mut contents)?;
        for (source, content) in contents {
            let source = match relative_path {
                Some(base) => join_path(base, &source),
                None => source,
            };
            self.map.set_source_content(&source, &content);
        }
        Ok(())
    }

    fn emit_basic_map(&mut self, code: &str, input: &MappedInput<'_>) -> Result<()> {
        let mut state = MappedCodeState::new(code);
        decode_mappings(&input.map.mappings, |mapping| {
            self.emit_decoded_mapping(&mut state, mapping, input)
        })?;
        self.finish_decoded_map(&mut state, input)
    }

    fn emit_decoded_mapping(
        &mut self,
        state: &mut MappedCodeState<'_>,
        mapping: DecodedMapping,
        input: &MappedInput<'_>,
    ) -> Result<()> {
        if let Some(previous) = state.last_mapping {
            if state.last_generated_line < mapping.generated_line {
                let chunk = state.cursor.take_current_line();
                self.emit_decoded(chunk, previous, input)?;
                state.last_generated_line += 1;
                state.last_generated_column = 0;
            } else {
                let width = mapping
                    .generated_column
                    .saturating_sub(state.last_generated_column);
                let chunk = state.cursor.take_prefix(width);
                self.emit_decoded(chunk, previous, input)?;
                state.last_generated_column = mapping.generated_column;
                state.last_mapping = Some(mapping);
                return Ok(());
            }
        }

        while state.last_generated_line < mapping.generated_line {
            let chunk = state.cursor.take_current_line();
            self.emit(chunk, None)?;
            state.last_generated_line += 1;
        }

        if state.last_generated_column < mapping.generated_column {
            let chunk = state.cursor.take_prefix(mapping.generated_column);
            self.emit(chunk, None)?;
            state.last_generated_column = mapping.generated_column;
        }

        state.last_mapping = Some(mapping);
        Ok(())
    }

    fn finish_decoded_map(
        &mut self,
        state: &mut MappedCodeState<'_>,
        input: &MappedInput<'_>,
    ) -> Result<()> {
        if !state.cursor.is_finished() {
            if let Some(previous) = state.last_mapping {
                let chunk = state.cursor.take_current_line();
                self.emit_decoded(chunk, previous, input)?;
            }
            let rest = state.cursor.take_rest();
            self.emit(rest, None)?;
        }

        Ok(())
    }

    fn emit_decoded(
        &mut self,
        chunk: &str,
        mapping: DecodedMapping,
        input: &MappedInput<'_>,
    ) -> Result<()> {
        let original = match (
            mapping.source,
            mapping.original_line,
            mapping.original_column,
        ) {
            (Some(source), Some(line), Some(column)) => {
                let source = input
                    .sources
                    .get(source as usize)
                    .ok_or_else(|| anyhow!("source index {source} is out of range"))?;
                let name = mapping
                    .name
                    .map(|index| {
                        input
                            .map
                            .names
                            .get(index as usize)
                            .map(|value| value.as_ref())
                            .ok_or_else(|| anyhow!("name index {index} is out of range"))
                    })
                    .transpose()?;
                Some((source.as_str(), line, column, name))
            }
            _ => None,
        };

        self.emit_named(chunk, original)
    }

    fn emit(&mut self, chunk: &str, original: Option<(&str, u32, u32)>) -> Result<()> {
        self.emit_named(
            chunk,
            original.map(|(source, line, column)| (source, line, column, None)),
        )
    }

    fn emit_named(
        &mut self,
        chunk: &str,
        original: Option<(&str, u32, u32, Option<&str>)>,
    ) -> Result<()> {
        if chunk.is_empty() {
            return Ok(());
        }

        let location = match original {
            Some((source, line, column, name)) => Some(OriginalLocation {
                source: self.map.intern_source(source),
                line,
                column,
                name: name.map(|value| self.map.intern_name(value)),
            }),
            None => None,
        };

        match location {
            Some(current) => {
                if self.code.active_original != Some(current) {
                    self.map.add(OutputMapping {
                        generated_line: self.code.line,
                        generated_column: self.code.column,
                        source: Some(current.source),
                        original_line: Some(current.line),
                        original_column: Some(current.column),
                        name: current.name,
                    })?;
                }
                self.code.active_original = Some(current);
            }
            None if self.code.active_original.is_some() => {
                self.map.add(OutputMapping {
                    generated_line: self.code.line,
                    generated_column: self.code.column,
                    source: None,
                    original_line: None,
                    original_column: None,
                    name: None,
                })?;
                self.code.active_original = None;
            }
            None => {}
        }

        self.code.writer.write_all(chunk.as_bytes())?;
        self.code.hasher.update(chunk.as_bytes());
        self.code.bytes += chunk.len() as u64;

        let mut chars = chunk.char_indices().peekable();
        while let Some((_, character)) = chars.next() {
            if character == '\n' {
                self.code.line += 1;
                self.code.column = 0;
                if chars.peek().is_none() {
                    self.code.active_original = None;
                } else if let Some(current) = self.code.active_original {
                    self.map.add(OutputMapping {
                        generated_line: self.code.line,
                        generated_column: 0,
                        source: Some(current.source),
                        original_line: Some(current.line),
                        original_column: Some(current.column),
                        name: current.name,
                    })?;
                }
            } else {
                self.code.column += character.len_utf16() as u32;
            }
        }

        Ok(())
    }
}

fn inflate_indexed_mappings(map: &RawSourceMap<'_>) -> Result<Vec<InflatedMapping>> {
    validate_version(&map.version)?;
    let mut output = Vec::new();
    let mut last_offset: Option<(u32, u32)> = None;

    for section in &map.sections {
        let offset = (section.offset.line, section.offset.column);
        if last_offset.is_some_and(|last| last > offset) {
            bail!("section offsets must be ordered and non-overlapping");
        }
        last_offset = Some(offset);

        let child = inflate_consumer_mappings(&section.map)?;
        let section_source = compute_source_url(consumer_source_root(&section.map), "");
        for mapping in child {
            let generated_line = mapping
                .generated_line
                .checked_add(section.offset.line)
                .ok_or_else(|| anyhow!("indexed generated line exceeds 2**32"))?;
            let generated_column = if section.offset.line + 1 == mapping.generated_line {
                mapping
                    .generated_column
                    .checked_add(section.offset.column)
                    .ok_or_else(|| anyhow!("indexed generated column exceeds 2**32"))?
            } else {
                mapping.generated_column
            };
            output.push(InflatedMapping {
                generated_line,
                generated_column,
                source: Some(section_source.clone()),
                original_line: mapping.original_line,
                original_column: mapping.original_column,
                name: mapping.name.filter(|name| !name.is_empty()),
            });
        }
    }

    Ok(output)
}

fn inflate_consumer_mappings(map: &RawSourceMap<'_>) -> Result<Vec<InflatedMapping>> {
    validate_version(&map.version)?;
    if !map.sections.is_empty() {
        return inflate_indexed_mappings(map);
    }

    let sources = map
        .sources
        .iter()
        .map(|source| {
            compute_source_url(map.source_root.as_deref(), &normalize_path(source.as_ref()))
        })
        .collect::<Vec<_>>();
    let mut output = Vec::new();
    decode_mappings(&map.mappings, |mapping| {
        output.push(InflatedMapping {
            generated_line: mapping.generated_line,
            generated_column: mapping.generated_column,
            source: mapping
                .source
                .and_then(|index| sources.get(index as usize).cloned()),
            original_line: mapping.original_line,
            original_column: mapping.original_column,
            name: mapping
                .name
                .and_then(|index| map.names.get(index as usize))
                .map(|value| value.to_string()),
        });
        Ok(())
    })?;
    output.sort_by(compare_inflated_mappings);
    Ok(output)
}

fn compare_inflated_mappings(
    left: &InflatedMapping,
    right: &InflatedMapping,
) -> std::cmp::Ordering {
    left.generated_line
        .cmp(&right.generated_line)
        .then_with(|| left.generated_column.cmp(&right.generated_column))
        .then_with(|| compare_nullable_strings(left.source.as_deref(), right.source.as_deref()))
        .then_with(|| left.original_line.cmp(&right.original_line))
        .then_with(|| left.original_column.cmp(&right.original_column))
        .then_with(|| compare_nullable_strings(left.name.as_deref(), right.name.as_deref()))
}

fn compare_nullable_strings(left: Option<&str>, right: Option<&str>) -> std::cmp::Ordering {
    match (left, right) {
        (Some(left), Some(right)) => left.cmp(right),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

fn consumer_source_root<'a>(map: &'a RawSourceMap<'a>) -> Option<&'a str> {
    if map.sections.is_empty() {
        map.source_root.as_deref()
    } else {
        None
    }
}

fn collect_source_contents(
    map: &RawSourceMap<'_>,
    output: &mut Vec<(String, String)>,
) -> Result<()> {
    validate_version(&map.version)?;
    if !map.sections.is_empty() {
        for section in &map.sections {
            collect_source_contents(&section.map, output)?;
        }
        return Ok(());
    }

    if let Some(contents) = &map.sources_content {
        for (index, source) in map.sources.iter().enumerate() {
            if let Some(Some(content)) = contents.get(index) {
                let source = compute_source_url(
                    map.source_root.as_deref(),
                    &normalize_path(source.as_ref()),
                );
                output.push((source, content.to_string()));
            }
        }
    }
    Ok(())
}

impl OutputMap {
    fn new(mapping_path: PathBuf) -> Result<Self> {
        let file = File::create(&mapping_path)?;
        Ok(Self {
            mapping_path,
            mapping_writer: BufWriter::new(file),
            sources: Vec::new(),
            source_indexes: HashMap::new(),
            names: Vec::new(),
            name_indexes: HashMap::new(),
            source_contents: HashMap::new(),
            pending: Vec::new(),
            previous_generated_line: 1,
            previous_generated_column: 0,
            previous_original_line: 0,
            previous_original_column: 0,
            previous_source: 0,
            previous_name: 0,
            wrote_mapping: false,
        })
    }

    fn intern_source(&mut self, source: &str) -> u32 {
        if let Some(index) = self.source_indexes.get(source) {
            return *index;
        }
        let index = self.sources.len() as u32;
        let owned = source.to_owned();
        self.sources.push(owned.clone());
        self.source_indexes.insert(owned, index);
        index
    }

    fn intern_name(&mut self, name: &str) -> u32 {
        if let Some(index) = self.name_indexes.get(name) {
            return *index;
        }
        let index = self.names.len() as u32;
        let owned = name.to_owned();
        self.names.push(owned.clone());
        self.name_indexes.insert(owned, index);
        index
    }

    fn set_source_content(&mut self, source: &str, content: &str) {
        self.source_contents
            .insert(source.to_owned(), content.to_owned());
    }

    fn add(&mut self, mapping: OutputMapping) -> Result<()> {
        if let Some(first) = self.pending.first()
            && (first.generated_line, first.generated_column)
                != (mapping.generated_line, mapping.generated_column)
        {
            self.flush_pending()?;
        }
        self.pending.push(mapping);
        Ok(())
    }

    fn flush_pending(&mut self) -> Result<()> {
        let sources = &self.sources;
        let names = &self.names;
        self.pending.sort_by(|left, right| {
            compare_optional_string(left.source, right.source, sources)
                .then_with(|| left.original_line.cmp(&right.original_line))
                .then_with(|| left.original_column.cmp(&right.original_column))
                .then_with(|| compare_optional_string(left.name, right.name, names))
        });

        let mut previous: Option<OutputMapping> = None;
        let pending = std::mem::take(&mut self.pending);
        for mapping in pending {
            if previous == Some(mapping) {
                continue;
            }
            self.encode(mapping)?;
            previous = Some(mapping);
        }
        Ok(())
    }

    fn encode(&mut self, mapping: OutputMapping) -> Result<()> {
        if mapping.generated_line != self.previous_generated_line {
            self.previous_generated_column = 0;
            while self.previous_generated_line < mapping.generated_line {
                self.mapping_writer.write_all(b";")?;
                self.previous_generated_line += 1;
            }
        } else if self.wrote_mapping {
            self.mapping_writer.write_all(b",")?;
        }

        write_vlq(
            &mut self.mapping_writer,
            mapping.generated_column as i64 - self.previous_generated_column,
        )?;
        self.previous_generated_column = mapping.generated_column as i64;

        if let Some(source) = mapping.source {
            write_vlq(
                &mut self.mapping_writer,
                source as i64 - self.previous_source,
            )?;
            self.previous_source = source as i64;

            let original_line = mapping.original_line.expect("mapped line") as i64 - 1;
            write_vlq(
                &mut self.mapping_writer,
                original_line - self.previous_original_line,
            )?;
            self.previous_original_line = original_line;

            let original_column = mapping.original_column.expect("mapped column") as i64;
            write_vlq(
                &mut self.mapping_writer,
                original_column - self.previous_original_column,
            )?;
            self.previous_original_column = original_column;

            if let Some(name) = mapping.name {
                write_vlq(&mut self.mapping_writer, name as i64 - self.previous_name)?;
                self.previous_name = name as i64;
            }
        }

        self.wrote_mapping = true;
        Ok(())
    }

    fn finish(&mut self, output_path: &Path, file: Option<&str>) -> Result<()> {
        self.flush_pending()?;
        self.mapping_writer.flush()?;

        let mut output = BufWriter::new(File::create(output_path)?);
        output.write_all(b"{\"version\":3,\"sources\":")?;
        serde_json::to_writer(&mut output, &self.sources)?;
        output.write_all(b",\"names\":")?;
        serde_json::to_writer(&mut output, &self.names)?;
        output.write_all(b",\"mappings\":\"")?;

        let mut mappings = File::open(&self.mapping_path)?;
        std::io::copy(&mut mappings, &mut output)?;
        output.write_all(b"\"")?;

        if let Some(file) = file {
            output.write_all(b",\"file\":")?;
            serde_json::to_writer(&mut output, file)?;
        }

        if !self.source_contents.is_empty() {
            output.write_all(b",\"sourcesContent\":[")?;
            for (index, source) in self.sources.iter().enumerate() {
                if index > 0 {
                    output.write_all(b",")?;
                }
                match self.source_contents.get(source) {
                    Some(content) => serde_json::to_writer(&mut output, content)?,
                    None => output.write_all(b"null")?,
                }
            }
            output.write_all(b"]")?;
        }

        output.write_all(b"}")?;
        output.flush()?;
        fs::remove_file(&self.mapping_path)?;
        Ok(())
    }
}

struct CodeCursor<'a> {
    code: &'a str,
    line_starts: Vec<usize>,
    line_index: usize,
    byte_offset: usize,
}

impl<'a> CodeCursor<'a> {
    fn new(code: &'a str) -> Self {
        let mut line_starts = vec![0];
        for (index, byte) in code.bytes().enumerate() {
            if byte == b'\n' {
                line_starts.push(index + 1);
            }
        }
        Self {
            code,
            line_starts,
            line_index: 0,
            byte_offset: 0,
        }
    }

    fn is_finished(&self) -> bool {
        self.byte_offset >= self.code.len()
    }

    fn current_line_end(&self) -> usize {
        self.line_starts
            .get(self.line_index + 1)
            .copied()
            .unwrap_or(self.code.len())
    }

    fn take_current_line(&mut self) -> &'a str {
        let start = self.byte_offset;
        let end = self.current_line_end();
        self.byte_offset = end;
        self.line_index = (self.line_index + 1).min(self.line_starts.len());
        &self.code[start..end]
    }

    fn take_prefix(&mut self, utf16_units: u32) -> &'a str {
        let start = self.byte_offset;
        let end = self.current_line_end();
        let line = &self.code[start..end];
        let mut units = 0_u32;
        let mut byte_len = 0_usize;
        for character in line.chars() {
            let next = units + character.len_utf16() as u32;
            if next > utf16_units {
                break;
            }
            units = next;
            byte_len += character.len_utf8();
            if units == utf16_units {
                break;
            }
        }
        self.byte_offset += byte_len;
        &self.code[start..self.byte_offset]
    }

    fn take_rest(&mut self) -> &'a str {
        let start = self.byte_offset;
        self.byte_offset = self.code.len();
        &self.code[start..]
    }
}

fn decode_mappings<F>(mappings: &str, mut callback: F) -> Result<()>
where
    F: FnMut(DecodedMapping) -> Result<()>,
{
    let bytes = mappings.as_bytes();
    let mut index = 0_usize;
    let mut generated_line = 1_u32;
    let mut generated_column = 0_i64;
    let mut source = 0_i64;
    let mut original_line = 0_i64;
    let mut original_column = 0_i64;
    let mut name = 0_i64;

    while index < bytes.len() {
        match bytes[index] {
            b';' => {
                generated_line = generated_line
                    .checked_add(1)
                    .ok_or_else(|| anyhow!("generated line exceeds 2**32"))?;
                generated_column = 0;
                index += 1;
            }
            b',' => index += 1,
            _ => {
                generated_column += decode_vlq(bytes, &mut index)?;
                ensure_u32("generated column", generated_column)?;

                let mut mapping = DecodedMapping {
                    generated_line,
                    generated_column: generated_column as u32,
                    source: None,
                    original_line: None,
                    original_column: None,
                    name: None,
                };

                if index < bytes.len() && !matches!(bytes[index], b',' | b';') {
                    source += decode_vlq(bytes, &mut index)?;
                    original_line += decode_vlq(bytes, &mut index)?;
                    original_column += decode_vlq(bytes, &mut index)?;
                    ensure_u32("source index", source)?;
                    ensure_u32("original line", original_line)?;
                    ensure_u32("original column", original_column)?;
                    mapping.source = Some(source as u32);
                    mapping.original_line = Some(original_line as u32 + 1);
                    mapping.original_column = Some(original_column as u32);

                    if index < bytes.len() && !matches!(bytes[index], b',' | b';') {
                        name += decode_vlq(bytes, &mut index)?;
                        ensure_u32("name index", name)?;
                        mapping.name = Some(name as u32);
                    }
                }

                if index < bytes.len() && !matches!(bytes[index], b',' | b';') {
                    bail!("mapping segment has more than five fields");
                }
                callback(mapping)?;
            }
        }
    }

    Ok(())
}

fn decode_vlq(bytes: &[u8], index: &mut usize) -> Result<i64> {
    let mut value = 0_u64;
    let mut shift = 0_u32;
    loop {
        let byte = *bytes
            .get(*index)
            .ok_or_else(|| anyhow!("reached EOF while parsing VLQ"))?;
        if matches!(byte, b',' | b';') {
            bail!("reached end of segment while parsing VLQ");
        }
        *index += 1;
        let digit = decode_base64(byte)?;
        value |= ((digit & 31) as u64) << shift;
        if digit & 32 == 0 {
            break;
        }
        shift += 5;
        if shift > 35 {
            bail!("VLQ value exceeds 2**32");
        }
    }

    let magnitude = (value >> 1) as i64;
    Ok(if value & 1 == 1 {
        -magnitude
    } else {
        magnitude
    })
}

fn write_vlq(writer: &mut impl Write, value: i64) -> Result<()> {
    const BASE64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut vlq = if value < 0 {
        ((-value) as u64) * 2 + 1
    } else {
        (value as u64) * 2
    };
    loop {
        let mut digit = (vlq & 31) as u8;
        vlq >>= 5;
        if vlq > 0 {
            digit |= 32;
        }
        writer.write_all(&[BASE64[digit as usize]])?;
        if vlq == 0 {
            return Ok(());
        }
    }
}

fn decode_base64(byte: u8) -> Result<u8> {
    match byte {
        b'A'..=b'Z' => Ok(byte - b'A'),
        b'a'..=b'z' => Ok(byte - b'a' + 26),
        b'0'..=b'9' => Ok(byte - b'0' + 52),
        b'+' => Ok(62),
        b'/' => Ok(63),
        _ => bail!("invalid base64 character 0x{byte:02x}"),
    }
}

fn ensure_u32(label: &str, value: i64) -> Result<()> {
    if !(0..=u32::MAX as i64).contains(&value) {
        bail!("{label} is negative or exceeds 2**32");
    }
    Ok(())
}

fn compare_optional_string(
    left: Option<u32>,
    right: Option<u32>,
    values: &[String],
) -> std::cmp::Ordering {
    match (left, right) {
        (Some(left), Some(right)) => values[left as usize].cmp(&values[right as usize]),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => std::cmp::Ordering::Equal,
    }
}

fn strip_xssi_prefix(value: &str) -> &str {
    if value.starts_with(")]}'") {
        value.split_once('\n').map_or(value, |(_, rest)| rest)
    } else {
        value
    }
}

fn validate_version(version: &serde_json::Value) -> Result<()> {
    let valid = version.as_u64() == Some(3) || version.as_str() == Some("3");
    if !valid {
        bail!("unsupported source-map version {version}");
    }
    Ok(())
}

fn normalize_path(value: &str) -> String {
    let absolute = value.starts_with('/');
    let trailing_slash = value.ends_with('/') && value.len() > 1;
    let mut parts = Vec::new();
    for part in value.split('/') {
        match part {
            "" | "." => {}
            ".." if parts.last().is_some_and(|part| *part != "..") => {
                parts.pop();
            }
            ".." if !absolute => parts.push(part),
            ".." => {}
            _ => parts.push(part),
        }
    }
    let joined = parts.join("/");
    let mut normalized = if absolute {
        format!("/{joined}")
    } else if joined.is_empty() {
        ".".to_owned()
    } else {
        joined
    };
    if trailing_slash && normalized != "/" && normalized != "." {
        normalized.push('/');
    }
    normalized
}

fn join_path(root: &str, path: &str) -> String {
    if path.starts_with('/') || path.contains("://") || path.starts_with("data:") {
        return path.to_owned();
    }
    normalize_path(&format!("{}/{path}", root.trim_end_matches('/')))
}

fn compute_source_url(source_root: Option<&str>, source: &str) -> String {
    match source_root.filter(|root| !root.is_empty()) {
        Some(root) if !root.ends_with('/') && !source.starts_with('/') => {
            normalize_path(&format!("{root}/{source}"))
        }
        Some(root) => normalize_path(&format!("{root}{source}")),
        None => normalize_path(source),
    }
}

fn validate_input_path(root: &Path, path: &Path) -> Result<()> {
    let canonical = path
        .canonicalize()
        .with_context(|| format!("resolving input {}", path.display()))?;
    if !canonical.starts_with(root) {
        bail!("input path {} is outside workspace", path.display());
    }
    Ok(())
}

fn validate_output_path(root: &Path, path: &Path) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| anyhow!("output path {} has no parent", path.display()))?;
    let existing = parent
        .ancestors()
        .find(|candidate| candidate.exists())
        .ok_or_else(|| anyhow!("output path {} has no existing ancestor", path.display()))?;
    let canonical = existing.canonicalize()?;
    if !canonical.starts_with(root) {
        bail!("output path {} is outside workspace", path.display());
    }
    Ok(())
}

fn sibling_temporary_path(path: &Path, label: &str) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("source-map");
    path.with_file_name(format!(".{name}.{label}.{}.tmp", std::process::id()))
}

fn hash_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hex_digest(hasher.finalize()))
}

fn hex_digest(value: impl AsRef<[u8]>) -> String {
    let mut output = String::with_capacity(value.as_ref().len() * 2);
    for byte in value.as_ref() {
        use std::fmt::Write as _;
        write!(&mut output, "{byte:02x}").expect("writing to String");
    }
    output
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn vlq_round_trips_signed_values() {
        for value in [-4096, -33, -1, 0, 1, 16, 4096] {
            let mut encoded = Vec::new();
            write_vlq(&mut encoded, value).unwrap();
            let mut index = 0;
            assert_eq!(decode_vlq(&encoded, &mut index).unwrap(), value);
            assert_eq!(index, encoded.len());
        }
    }

    #[test]
    fn rejects_paths_outside_workspace() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let file = outside.path().join("input.map");
        fs::write(&file, "{}").unwrap();
        assert!(validate_input_path(root.path(), &file).is_err());
        assert!(validate_output_path(root.path(), &outside.path().join("out.map")).is_err());
    }
}
