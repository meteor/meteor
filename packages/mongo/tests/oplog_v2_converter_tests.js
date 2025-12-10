import { oplogV2V1Converter } from '../oplog_v2_converter';

const cases = [
  [
    { $v: 2, diff: { scustom: { sEJSON$value: { u: { EJSONtail: 'd' } } } } },
    { $v: 2, $set: { 'custom.EJSON$value.EJSONtail': 'd' } },
  ],
  [
    { $v: 2, diff: { u: { d: '2', oi: 'asdas' } } },
    { $v: 2, $set: { d: '2', oi: 'asdas' } },
  ],
  [
    { $v: 2, diff: { sasd: { a: true, u0: 2 } } },
    { $v: 2, $set: { 'asd.0': 2 } },
  ],
  [
    { $v: 2, diff: { sasd: { a: true, u0: null } } },
    { $v: 2, $unset: { 'asd.0': true } },
  ],
  [
    { $v: 2, diff: { i: { a: { b: 2 } } } },
    { $v: 2, $set: { 'a.b': 2 } },
  ],
  [
    { $v: 2, diff: { u: { count: 1 }, i: { nested: { state: {} } } } },
    { $v: 2, $set: { 'nested.state': {}, count: 1 } },
  ],
  [
    { $v: 2, diff: { sa: { i: { b: 3, c: 1 } } } },
    { $v: 2, $set: { 'a.b': 3, 'a.c': 1 } },
  ],
  [
    { $v: 2, diff: { sa: { d: { b: false } } } },
    { $v: 2, $unset: { 'a.b': true } },
  ],
  [
    { $v: 2, diff: { u: { c: 'bar' }, sb: { a: true, u0: 2 } } },
    { $v: 2, $set: { 'b.0': 2, c: 'bar' } },
  ],
  [
    { $v: 2, diff: { sservices: { sresume: { u: { loginTokens: [] } } } } },
    { $v: 2, $set: { 'services.resume.loginTokens': [] } },
  ],
  [
    { $v: 2, diff: { i: { tShirt: { sizes: ['small', 'medium', 'large'] } } } },
    { $v: 2, $set: { 'tShirt.sizes': ['small', 'medium', 'large'] } },
  ],
  [
    { $v: 2, diff: { slist: { a: true, u3: 'i', u4: 'h' } } },
    { $v: 2, $set: { 'list.3': 'i', 'list.4': 'h' } },
  ],
  [
    { $v: 2, $set: { 'services.resume.loginTokens': [ { when: '2022-01-06T23:58:35.704Z', hashedToken: 'RlalW6ZSvPPJLH6sW3B1b+vrUnPy+Ox5oMv3O3S7jwg=' }, { when: '2022-01-06T23:58:35.704Z', hashedToken: 'DWG0Qw/+nZ48wAIhKR2r9H41wLpth9BM+Br6aZsl2bU=' }, ], }, },
    { $v: 2, $set: { 'services.resume.loginTokens': [ { when: '2022-01-06T23:58:35.704Z', hashedToken: 'RlalW6ZSvPPJLH6sW3B1b+vrUnPy+Ox5oMv3O3S7jwg=' }, { when: '2022-01-06T23:58:35.704Z', hashedToken: 'DWG0Qw/+nZ48wAIhKR2r9H41wLpth9BM+Br6aZsl2bU=' }, ], }, },
  ],
  [
    { $v: 2, diff: { sobject: { u: { array: ['2', '2', '4', '3'] } } } },
    { $v: 2, $set: { 'object.array': ['2', '2', '4', '3'] } },
  ],
  [
    { $v: 2, diff: { slayout: { sjourneyStepIds: { sj4aqp3tiK6xCPCYu8: { a: true, u2: 'zTkxivNrKuBi2iJ2m' } } } } },
    { $v: 2, $set: { 'layout.journeyStepIds.j4aqp3tiK6xCPCYu8.2': 'zTkxivNrKuBi2iJ2m' } },
  ],
  [
    { $v: 2, diff: { sarray: { a: true, s2: { u: { a: 'something' } } } } },
    { $v: 2, $set: { 'array.2.a': 'something' } },
  ],
  [
    { $v: 2, diff: { u: { params: { d: 5 } } } },
    { $v: 2, $set: { params: { d: 5 } } },
  ],
  [
    { $v: 2, diff: { u: { params: { a: 5, d: 5 } } } },
    { $v: 2, $set: { params: { a: 5, d: 5 } } },
  ],
  [
    { $v: 2, diff: { u: { params: { e: { _str: '5f953cde8ceca90030bdb86f' } } } } },
    { $v: 2, $set: { params: { e: { _str: '5f953cde8ceca90030bdb86f' } } } },
  ],
  [
    { $v: 2, diff: { i: { id: new Mongo.ObjectID('ffffffffffffffffffffffff') } } },
    { $v: 2, $set: { id: new Mongo.ObjectID('ffffffffffffffffffffffff') } },
  ],
  [
    {
      $v: 2,
      diff: {
        sitems: {
          a: true,
          s0: {
            u: { id: 'm57DsX8g8L66bM5JX', name: 'Alice' },
            sbio: { u: { en: 'Just Alice' } },
            slanguages: {
              a: true,
              s0: {
                u: { englishName: 'English', key: 'en', localName: 'English' },
              },
            },
          },
          u1: {
            id: 'FJwSQHqwpenCN6RQH',
            name: 'Bob',
            title: { en: 'Fictional character', sv: '' },
            bio: { en: 'Just Bob', sv: '' },
            avatar: null,
            languages: [
              { key: 'sv', englishName: 'Swedish', localName: 'Sverige' },
            ],
          },
          u2: null
        },
      },
    },
    {
      $v: 2,
      $set: {
        'items.0.id': 'm57DsX8g8L66bM5JX',
        'items.0.name': 'Alice',
        'items.0.bio.en': 'Just Alice',
        'items.0.languages.0.englishName': 'English',
        'items.0.languages.0.key': 'en',
        'items.0.languages.0.localName': 'English',
        'items.1': {
          id: 'FJwSQHqwpenCN6RQH',
          name: 'Bob',
          title: {
            en: 'Fictional character',
            sv: '',
          },
          bio: {
            en: 'Just Bob',
            sv: '',
          },
          avatar: null,
          languages: [
            {
              key: 'sv',
              englishName: 'Swedish',
              localName: 'Sverige',
            },
          ],
        },
      },
      $unset: {
        'items.2': true
      }
    },
  ]
];

Tinytest.add('oplog - v2/v1 conversion', function (test) {
  cases.forEach(([input, output]) => {
    test.equal(oplogV2V1Converter(input), output);
  });
});
