package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenSourceMapStreamsDeferredFields(t *testing.T) {
	path := writeSourceMapFixture(t, `{
		"version": 3,
		"sources": ["a.js", "b.js"],
		"names": ["value"],
		"sourcesContent": ["const value = \"✓\";", null],
		"mappings": "AAAA\u0041"
	}`)

	document, err := openSourceMap(path)
	if err != nil {
		t.Fatal(err)
	}
	defer document.Close()

	if got := document.root.Sources[0]; got != "a.js" {
		t.Fatalf("unexpected source: %q", got)
	}
	if got := document.root.Names[0]; got != "value" {
		t.Fatalf("unexpected name: %q", got)
	}

	content, present, err := document.readOptionalString(document.root.SourcesContent[0])
	if err != nil {
		t.Fatal(err)
	}
	if !present || content != `const value = "✓";` {
		t.Fatalf("unexpected source content: present=%t content=%q", present, content)
	}
	if _, present, err := document.readOptionalString(document.root.SourcesContent[1]); err != nil || present {
		t.Fatalf("expected null source content: present=%t err=%v", present, err)
	}

	reader, err := document.stringReader(document.root.Mappings)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []mapping
	if err := decodeMappings(reader, func(value mapping) error {
		decoded = append(decoded, value)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if len(decoded) != 1 || !decoded[0].HasName || decoded[0].Name != 0 {
		t.Fatalf("unexpected decoded mappings: %#v", decoded)
	}
}

func TestOpenSourceMapParsesIndexedMaps(t *testing.T) {
	path := writeSourceMapFixture(t, `{
		"version": 3,
		"sections": [{
			"offset": {"line": 2, "column": 4},
			"map": {"version": 3, "sources": ["a.js"], "names": [], "mappings": "AAAA"}
		}]
	}`)

	document, err := openSourceMap(path)
	if err != nil {
		t.Fatal(err)
	}
	defer document.Close()

	if len(document.root.Sections) != 1 {
		t.Fatalf("unexpected section count: %d", len(document.root.Sections))
	}
	section := document.root.Sections[0]
	if section.Offset.Line != 2 || section.Offset.Column != 4 || section.Map.Sources[0] != "a.js" {
		t.Fatalf("unexpected section: %#v", section)
	}
}

func TestOpenSourceMapRejectsTrailingInput(t *testing.T) {
	path := writeSourceMapFixture(t, `{"version":3,"sources":[],"names":[],"mappings":""} false`)

	document, err := openSourceMap(path)
	if document != nil {
		document.Close()
	}
	if err == nil {
		t.Fatal("expected trailing input to be rejected")
	}
}

func writeSourceMapFixture(t *testing.T, contents string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "input.js.map")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}
