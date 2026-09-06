"""Procedural snapshot checks; no stored heap fixtures or extra dependencies."""
import json
from pathlib import Path
import subprocess
import tempfile
from typing import TypeAlias, cast

Json: TypeAlias = "None | bool | int | float | str | list[Json] | dict[str, Json]"

def obj(value: Json) -> dict[str, Json]:
    assert isinstance(value, dict)
    return value

def arr(value: Json) -> list[Json]:
    assert isinstance(value, list)
    return value
import unittest

ANALYZER = Path(__file__).with_name('analyze-source-node-heap.py')


def snapshot(weak_holder: bool = False) -> dict[str, object]:
    strings: list[str] = []

    def string(value: str) -> int:
        if value not in strings:
            strings.append(value)
        return strings.index(value)

    # Deliberately reorder fields relative to V8's usual layout.
    node_fields = ['name', 'edge_count', 'self_size', 'type', 'id']
    edge_fields = ['to_node', 'name_or_index', 'type']
    types = ['object', 'array', 'string', 'concatenated string']
    edge_types = ['property', 'internal', 'element', 'weak']
    descriptions = [
        ('global', 'object', 16, [('weak' if weak_holder else 'property', '__sourceNodeHypothesisRoot', 1)]),
        ('SourceNode', 'object', 64, [('property', 'children', 2), ('property', 'sourceContents', 3)]),
        ('Array', 'object', 24, [('internal', 'elements', 4), ('element', 0, 5)]),
        ('Object', 'object', 16, [('internal', 'elements', 6)]),
        ('(object elements)', 'array', 32, [('internal', '0', 5)]),
        ('SourceNode', 'object', 64, [('property', 'children', 7), ('property', 'sourceContents', 3), ('property', 'source', 10), ('property', 'name', 13)]),
        ('(object elements)', 'array', 0, []),
        ('Array', 'object', 24, [('internal', 'elements', 6)]),
        ('SourceNode', 'object', 64, [('weak', 'children', 9), ('property', 'source', 11), ('property', 'name', 12)]),
        ('Array', 'object', 24, []),
        ('same-source.js', 'string', 24, []),
        ('same-source.js', 'string', 24, []),
        ('(concatenated string)', 'concatenated string', 32, []),
        ('symbolName', 'string', 24, []),
    ]
    nodes: list[int] = []
    edges: list[int] = []
    for index, (name, kind, size, outgoing) in enumerate(descriptions):
        nodes.extend([string(name), len(outgoing), size, types.index(kind), index * 2 + 1])
        for edge_kind, name_or_index, target in outgoing:
            name_value = int(name_or_index) if edge_kind == 'element' else string(str(name_or_index))
            edges.extend([target * len(node_fields), name_value, edge_types.index(edge_kind)])
    return {'snapshot': {'meta': {'node_fields': node_fields,
            'node_types': ['string', 'number', 'number', types, 'number'],
            'edge_fields': edge_fields, 'edge_types': ['node', 'string_or_number', edge_types]}},
            'nodes': nodes, 'edges': edges, 'strings': strings}


class AnalyzerTests(unittest.TestCase):
    def analyze(self, weak_holder: bool = False, compact: bool = False) -> dict[str, Json]:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'fixture.heapsnapshot'
            document = snapshot(weak_holder)
            if compact:
                names = cast(list[str], document['strings'])
                nodes = cast(list[int], document['nodes'])
                names.append('CompactSourceNodeLeaf')
                nodes[5 * 5] = len(names) - 1
            source.write_text(json.dumps(document))
            result = subprocess.run(['python3', str(ANALYZER), str(source)],
                                    check=True, capture_output=True, text=True)
            return obj(cast(Json, json.loads(result.stdout)))

    def test_metadata_counts_deduplication_and_strong_path(self) -> None:
        result = self.analyze()
        metrics = obj(result['sourceNode'])
        self.assertEqual(metrics['instances'], {'count': 3, 'shallowBytes': 192})
        self.assertEqual(metrics['childrenArrays'], {'count': 2, 'shallowBytes': 48})
        self.assertEqual(metrics['sourceContentsObjects'], {'count': 1, 'shallowBytes': 16})
        self.assertEqual(metrics['internalElementsBacking'], {'count': 2, 'shallowBytes': 32})
        path = arr(arr(result['holderToLeafPaths'])[0])
        self.assertEqual([obj(step)['edgeName'] for step in path],
                         ['__sourceNodeHypothesisRoot', 'children', '0'])
        self.assertEqual(obj(obj(path[-1])['to'])['name'], 'SourceNode')
        self.assertIn('not retained sizes', str(result['sizeSemantics']))

    def test_metadata_distinguishes_identity_values_and_rope_types(self) -> None:
        metadata = obj(self.analyze()['leafMetadata'])
        leaves = obj(metadata['SourceNode'])
        self.assertEqual(leaves['leafCount'], 2)
        fields = obj(leaves['fields'])
        source = obj(fields['source'])
        self.assertEqual(source['distinctTargetNodes'], 2)
        self.assertEqual(source['distinctPlainStringValues'], 1)
        self.assertEqual(source['uniqueTargetShallowBytes'], 48)
        names = obj(fields['name'])
        self.assertEqual(names['distinctPlainStringValues'], 1)
        self.assertEqual(obj(names['targetsByType'])['concatenated string'],
                         {'count': 1, 'shallowBytes': 32})

    def test_compact_leaf_path(self) -> None:
        result = self.analyze(compact=True)
        self.assertEqual(result['compactSourceNodeLeaf'], {'count': 1, 'shallowBytes': 64})
        self.assertEqual(obj(obj(arr(arr(result['holderToLeafPaths'])[0])[-1])['to'])['name'], 'CompactSourceNodeLeaf')

    def test_weak_holder_is_not_a_retaining_path(self) -> None:
        self.assertEqual(self.analyze(True)['holderToLeafPaths'], [])


if __name__ == '__main__':
    unittest.main()
