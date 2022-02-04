import { oplogV2V1Converter } from './oplog_v2_converter';

Tinytest.only('oplog - v2/v1 conversion', function(test) {
  const entry1 = {
    $v: 2,
    diff: { scustom: { sEJSON$value: { u: { EJSONtail: 'd' } } } },
  };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry1)),
    JSON.stringify({
      $v: 2,
      $set: { 'custom.EJSON$value.EJSONtail': 'd' },
    })
  );

  const entry2 = {
    $v: 2,
    diff: { u: { d: '2', oi: 'asdas' } },
  };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry2)),
    JSON.stringify({
      $v: 2,
      $set: { d: '2', oi: 'asdas' },
    })
  );

  //set inside an array
  const entry3 = { $v: 2, diff: { sasd: { a: true, u0: 2 } } };

  test.equal(
    JSON.stringify(oplogV2V1Converter(entry3)),
    JSON.stringify({ $v: 2, $set: { 'asd.0': 2 } })
  );

  //unset inside an array
  const entry4 = { $v: 2, diff: { sasd: { a: true, u0: null } } };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry4)),
    JSON.stringify({ $v: 2, $unset: { 'asd.0': true } })
  );

  //set a new nested field inside an object
  const entry5 = {
    $v: 2,
    diff: { i: { a: { b: 2 } } },
  };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry5)),
    JSON.stringify({ $v: 2, $set: { 'a.b': 2 } })
  );

  //set a new nested field inside an object
  const entry51 =  { "$v" : 2, "diff" : { "u" : { "count" : 1 }, "i" : { "nested" : { "state" : {  } } } } };
  // the correct format for this test, inspecting the mongodb oplog, should be "nested" : { "state" : {  } } }
  // but this is not a case in which we cant flatten the object without collateral, so we are considering
  // "nested.state" : {  } to be valid too
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry51)),
    JSON.stringify( { "$v" : 2, "$set" : { "nested.state": {  }, "count" : 1 } })
  );

  //set an existing nested field inside an object
  const entry6 = {
    $v: 2,
    diff: { sa: { i: { b: 3, c: 1 } } },
  };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry6)),
    JSON.stringify({
      $v: 2,
      $set: { 'a.b': 3, 'a.c': 1 },
    })
  );

  //unset an existing nested field inside an object
  const entry7 = {
    $v: 2,
    diff: { sa: { d: { b: false } } },
  };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry7)),
    JSON.stringify({ $v: 2, $unset: { 'a.b': true } })
  );

  const entry8 = { $v: 2, diff: { u: { c: 'bar' }, sb: { a: true, u0: 2 } } };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry8)),
    JSON.stringify({ $v: 2, $set: { 'b.0': 2, c: 'bar' } })
  );

  const entry9 = {
    $v: 2,
    diff: { sservices: { sresume: { u: { loginTokens: [] } } } },
  };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry9)),
    JSON.stringify({ $v: 2, $set: { 'services.resume.loginTokens': [] } })
  );

  const entry10 = {
    $v: 2,
    $set: {
      'services.resume.loginTokens': [
        {
          when: '2022-01-06T23:58:35.704Z',
          hashedToken: 'RlalW6ZSvPPJLH6sW3B1b+vrUnPy+Ox5oMv3O3S7jwg=',
        },
        {
          when: '2022-01-06T23:58:35.704Z',
          hashedToken: 'DWG0Qw/+nZ48wAIhKR2r9H41wLpth9BM+Br6aZsl2bU=',
        },
      ],
    },
  };
  test.equal(
    JSON.stringify(oplogV2V1Converter(entry10)),
    JSON.stringify({
      $v: 2,
      $set: {
        'services.resume.loginTokens': [
          {
            when: '2022-01-06T23:58:35.704Z',
            hashedToken: 'RlalW6ZSvPPJLH6sW3B1b+vrUnPy+Ox5oMv3O3S7jwg=',
          },
          {
            when: '2022-01-06T23:58:35.704Z',
            hashedToken: 'DWG0Qw/+nZ48wAIhKR2r9H41wLpth9BM+Br6aZsl2bU=',
          },
        ],
      },
    })
  );
});
