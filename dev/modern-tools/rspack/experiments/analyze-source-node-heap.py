"""Inspect V8 heap snapshots using shallow accounting, without dominator claims."""
from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterator, TypeAlias, cast

Json: TypeAlias = 'None | bool | int | float | str | list[Json] | dict[str, Json]'
SOURCE_NODE = 'SourceNode'
COMPACT_LEAF = 'CompactSourceNodeLeaf'
METADATA_FIELDS = ('source', 'name')
HOLDER = '__sourceNodeHypothesisRoot'
OWN_FIELDS = ('children', 'sourceContents')


def object_value(value: Json) -> dict[str, Json]:
    if not isinstance(value, dict):
        raise ValueError('Expected a JSON object')
    return value


def array_value(value: Json) -> list[Json]:
    if not isinstance(value, list):
        raise ValueError('Expected a JSON array')
    return value


def strings_value(value: Json) -> list[str]:
    items = array_value(value)
    if not all(isinstance(item, str) for item in items):
        raise ValueError('Expected string array')
    return cast(list[str], items)


def integers_value(value: Json) -> list[int]:
    items = array_value(value)
    if not all(type(item) is int for item in items):
        raise ValueError('Expected integer array')
    return cast(list[int], items)


@dataclass(frozen=True)
class Edge:
    kind: str
    name: str
    target: int


class Snapshot:
    """Index flat V8 tables while respecting the snapshot's declared metadata."""

    def __init__(self, document: dict[str, Json]) -> None:
        meta = object_value(object_value(document['snapshot'])['meta'])
        self.node_fields = strings_value(meta['node_fields'])
        self.edge_fields = strings_value(meta['edge_fields'])
        self.node_index = {name: index for index, name in enumerate(self.node_fields)}
        self.edge_index = {name: index for index, name in enumerate(self.edge_fields)}
        self.node_types = strings_value(array_value(meta['node_types'])[self.node_index['type']])
        self.edge_types = strings_value(array_value(meta['edge_types'])[self.edge_index['type']])
        self.nodes = integers_value(document['nodes'])
        self.edges = integers_value(document['edges'])
        self.strings = strings_value(document['strings'])
        self.node_width = len(self.node_fields)
        self.edge_width = len(self.edge_fields)
        if len(self.nodes) % self.node_width or len(self.edges) % self.edge_width:
            raise ValueError('Incomplete node or edge record')
        self.count = len(self.nodes) // self.node_width
        self.edge_starts: list[int] = []
        offset = 0
        for node in range(self.count):
            self.edge_starts.append(offset)
            count = self.number(node, 'edge_count')
            if count < 0:
                raise ValueError('Negative edge count')
            offset += count * self.edge_width
        if offset != len(self.edges):
            raise ValueError('Node edge counts do not match edge table')

    def number(self, node: int, field: str) -> int:
        return self.nodes[node * self.node_width + self.node_index[field]]

    def name(self, node: int) -> str:
        return self.strings[self.number(node, 'name')]

    def kind(self, node: int) -> str:
        return self.node_types[self.number(node, 'type')]

    def describe(self, node: int) -> dict[str, Json]:
        return {'id': self.number(node, 'id'), 'name': self.name(node),
                'type': self.kind(node), 'shallowBytes': self.number(node, 'self_size')}

    def outgoing(self, node: int) -> Iterator[Edge]:
        start = self.edge_starts[node]
        end = start + self.number(node, 'edge_count') * self.edge_width
        for offset in range(start, end, self.edge_width):
            kind = self.edge_types[self.edges[offset + self.edge_index['type']]]
            raw_name = self.edges[offset + self.edge_index['name_or_index']]
            name = str(raw_name) if kind in ('element', 'hidden') else self.strings[raw_name]
            raw_target = self.edges[offset + self.edge_index['to_node']]
            if raw_target % self.node_width or not 0 <= raw_target < len(self.nodes):
                raise ValueError('Invalid edge target offset')
            yield Edge(kind, name, raw_target // self.node_width)

    def strong(self, node: int) -> Iterator[Edge]:
        return (edge for edge in self.outgoing(node) if edge.kind != 'weak')

    def totals(self, nodes: set[int]) -> dict[str, Json]:
        return {'count': len(nodes), 'shallowBytes': sum(self.number(node, 'self_size') for node in nodes)}


def holder_path(snapshot: Snapshot, holder_owner: int, holder_edge: Edge,
                source_nodes: set[int]) -> list[Json]:
    """Find one tree leaf by BFS; not a dominator or exclusive-retention proof.

    Before entering the tree, follow own properties/elements only. Within a
    SourceNode follow its children, not its prototype or metadata references.
    A leaf here is a SourceNode whose children contain no further SourceNode.
    """
    parents: dict[int, tuple[int, Edge]] = {holder_edge.target: (holder_owner, holder_edge)}
    queue = deque([holder_edge.target])
    visited = {holder_owner, holder_edge.target}
    leaf: int | None = None
    while queue:
        node = queue.popleft()
        edges = list(snapshot.strong(node))
        if node in source_nodes:
            children_edges = [edge for edge in edges if edge.kind == 'property' and edge.name == 'children']
            has_child_node = any(
                child.target in source_nodes
                for edge in children_edges
                for child in snapshot.strong(edge.target)
                if child.kind == 'element'
            )
            if not has_child_node:
                leaf = node
                break
            edges = children_edges
        else:
            # V8 exposes JS array entries as element edges, so internal backing
            # and prototype edges are unnecessary for the illustrative path.
            edges = [edge for edge in edges if edge.kind in ('property', 'element')
                     and edge.name != '__proto__']
        for edge in edges:
            if edge.target not in visited:
                visited.add(edge.target)
                parents[edge.target] = (node, edge)
                queue.append(edge.target)
    if leaf is None:
        return []
    path: list[Json] = []
    current = leaf
    while current != holder_owner:
        parent, edge = parents[current]
        path.append({'from': snapshot.describe(parent), 'edgeType': edge.kind,
                     'edgeName': edge.name, 'to': snapshot.describe(current)})
        current = parent
    return list(reversed(path))


def metadata_totals(snapshot: Snapshot, source_nodes: set[int],
                    compact_leaves: set[int]) -> dict[str, Json]:
    """Compare leaf metadata identity and plain-string values without flattening ropes."""
    all_tree_nodes = source_nodes | compact_leaves
    leaves = {
        node for node in source_nodes
        if not any(child.target in all_tree_nodes
                   for edge in snapshot.strong(node)
                   if edge.kind == 'property' and edge.name == 'children'
                   for child in snapshot.strong(edge.target) if child.kind == 'element')
    }
    result: dict[str, Json] = {}
    for class_name, class_leaves in ((SOURCE_NODE, leaves), (COMPACT_LEAF, compact_leaves)):
        fields: dict[str, Json] = {}
        for field in METADATA_FIELDS:
            targets: set[int] = set()
            references = 0
            for leaf in class_leaves:
                for edge in snapshot.strong(leaf):
                    if edge.kind == 'property' and edge.name == field:
                        targets.add(edge.target)
                        references += 1
            by_type: dict[str, set[int]] = {}
            for target in targets:
                by_type.setdefault(snapshot.kind(target), set()).add(target)
            plain_strings = by_type.get('string', set())
            fields[field] = {
                'propertyEdges': references,
                'distinctTargetNodes': len(targets),
                'uniqueTargetShallowBytes': sum(snapshot.number(node, 'self_size') for node in targets),
                'distinctPlainStringValues': len({snapshot.name(node) for node in plain_strings}),
                'plainStringTargets': snapshot.totals(plain_strings),
                'targetsByType': {kind: snapshot.totals(nodes) for kind, nodes in sorted(by_type.items())},
            }
        result[class_name] = {'leafCount': len(class_leaves), 'fields': fields}
    result['semantics'] = ('Plain values compared only for type string. Concatenated/sliced strings and '
                           'non-string targets remain separate type totals; their values are not reconstructed. '
                           'Leaf means no direct SourceNode/CompactSourceNodeLeaf child in the children array.')
    return result


def analyze(document: dict[str, Json], holder: str = HOLDER) -> dict[str, Json]:
    snapshot = Snapshot(document)
    groups: dict[tuple[str, str], tuple[int, int]] = {}
    compact_leaves: set[int] = set()
    source_nodes: set[int] = set()
    holders: list[tuple[int, Edge]] = []
    for node in range(snapshot.count):
        kind, name = snapshot.kind(node), snapshot.name(node)
        # Constructor-like labels are useful for objects. Group primitive and
        # backing storage by type, avoiding copying every source-text string.
        group_name = name if kind in ('object', 'closure', 'native', 'synthetic') else ''
        count, size = groups.get((kind, group_name), (0, 0))
        groups[kind, group_name] = (count + 1, size + snapshot.number(node, 'self_size'))
        if kind == 'object' and name == SOURCE_NODE:
            source_nodes.add(node)
        if kind == 'object' and name == COMPACT_LEAF:
            compact_leaves.add(node)
        holders.extend((node, edge) for edge in snapshot.strong(node)
                       if edge.kind == 'property' and edge.name == holder)

    references: dict[str, set[int]] = {field: set() for field in OWN_FIELDS}
    for node in source_nodes:
        for edge in snapshot.strong(node):
            if edge.kind == 'property' and edge.name in references:
                references[edge.name].add(edge.target)
    children = {node for node in references['children'] if snapshot.name(node) == 'Array'
                and snapshot.kind(node) == 'object'}
    contents = {node for node in references['sourceContents'] if snapshot.kind(node) == 'object'}
    backing = {edge.target for node in children | contents for edge in snapshot.strong(node)
               if edge.kind == 'internal' and edge.name == 'elements'}
    combined = source_nodes | children | contents | backing
    paths: list[Json] = []
    root_references: list[Json] = []
    for owner, edge in holders:
        root = edge.target
        own_references: list[Json] = []
        for own in snapshot.strong(root):
            if own.kind == 'property' and own.name in OWN_FIELDS:
                own_references.append({'property': own.name, 'target': snapshot.describe(own.target),
                    'internalElements': [snapshot.describe(child.target)
                        for child in snapshot.strong(own.target)
                        if child.kind == 'internal' and child.name == 'elements']})
        root_references.append({'root': snapshot.describe(root), 'ownReferences': own_references})
        path = holder_path(snapshot, owner, edge, source_nodes | compact_leaves)
        if path:
            paths.append(path)
    aggregate: list[Json] = [
        {'type': kind, 'name': name, 'count': count, 'shallowBytes': size}
        for (kind, name), (count, size) in sorted(groups.items(), key=lambda item: (-item[1][1], item[0]))
    ]
    return {
        'sizeSemantics': 'Unique-node shallow bytes, not retained sizes; no dominator analysis. '
                         'Objects may be shared or unreachable but not collected. Weak edges are excluded from paths and references.',
        'constructorSemantics': 'Object node names are V8 snapshot labels, not independently verified constructor identities. Primitive/backing nodes are grouped by type without string contents.',
        'nodeCount': snapshot.count,
        'aggregateByTypeAndName': aggregate,
        'sourceNode': {'instances': snapshot.totals(source_nodes),
                       'childrenArrays': snapshot.totals(children),
                       'sourceContentsObjects': snapshot.totals(contents),
                       'internalElementsBacking': snapshot.totals(backing),
                       'combinedUnique': snapshot.totals(combined)},
        'compactSourceNodeLeaf': snapshot.totals(compact_leaves),
        'structuralCombinedUnique': snapshot.totals(combined | compact_leaves),
        'leafMetadata': metadata_totals(snapshot, source_nodes, compact_leaves),
        'holderRootReferences': root_references,
        'holderProperty': holder,
        'holderToLeafPaths': paths,
        'pathSemantics': 'Illustrative non-weak property/element paths from a named holder property to a SourceNode leaf; '
                         'not a proof of exclusive retention or a complete GC-root path.',
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('--holder', default=HOLDER)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    with args.snapshot.open() as stream:
        document = object_value(cast(Json, json.load(stream)))
    result = json.dumps(analyze(document, args.holder), indent=2) + '\n'
    if args.output:
        args.output.write_text(result)
    else:
        print(result, end='')


if __name__ == '__main__':
    main()
