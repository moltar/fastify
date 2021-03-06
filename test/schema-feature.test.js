'use strict'

const { test } = require('tap')
const Fastify = require('..')
const fp = require('fastify-plugin')
const { kSchemas } = require('../lib/symbols.js')

const echoParams = (req, reply) => { reply.send(req.params) }
const echoBody = (req, reply) => { reply.send(req.body) }

;['addSchema', 'getSchema', 'getSchemas', 'setValidatorCompiler', 'setSerializerCompiler'].forEach(f => {
  test(`Should expose ${f} function`, t => {
    t.plan(1)
    const fastify = Fastify()
    t.is(typeof fastify[f], 'function')
  })
})

;['setValidatorCompiler', 'setSerializerCompiler'].forEach(f => {
  test(`cannot call ${f} after binding`, t => {
    t.plan(2)
    const fastify = Fastify()
    t.tearDown(fastify.close.bind(fastify))
    fastify.listen(0, err => {
      t.error(err)
      try {
        fastify[f](() => { })
        t.fail()
      } catch (e) {
        t.pass()
      }
    })
  })
})

test('The schemas should be added to an internal storage', t => {
  t.plan(1)
  const fastify = Fastify()
  const schema = { $id: 'id', my: 'schema' }
  fastify.addSchema(schema)
  t.deepEqual(fastify[kSchemas].store, { id: schema })
})

test('The schemas should be accessible via getSchemas', t => {
  t.plan(1)
  const fastify = Fastify()

  const schemas = {
    id: { $id: 'id', my: 'schema' },
    abc: { $id: 'abc', my: 'schema' },
    bcd: { $id: 'bcd', my: 'schema', properties: { a: 'a', b: 1 } }
  }

  Object.values(schemas).forEach(schema => { fastify.addSchema(schema) })
  t.deepEqual(fastify.getSchemas(), schemas)
})

test('The schema should be accessible by id via getSchema', t => {
  t.plan(3)
  const fastify = Fastify()

  const schemas = [
    { $id: 'id', my: 'schema' },
    { $id: 'abc', my: 'schema' },
    { $id: 'bcd', my: 'schema', properties: { a: 'a', b: 1 } }
  ]
  schemas.forEach(schema => { fastify.addSchema(schema) })
  t.deepEqual(fastify.getSchema('abc'), schemas[1])
  t.deepEqual(fastify.getSchema('id'), schemas[0])
  t.deepEqual(fastify.getSchema('foo'), undefined)
})

test('Get validatorCompiler after setValidatorCompiler', t => {
  t.plan(2)
  const myCompiler = () => { }
  const fastify = Fastify()
  fastify.setValidatorCompiler(myCompiler)
  const sc = fastify.validatorCompiler
  t.ok(Object.is(myCompiler, sc))
  fastify.ready(err => t.error(err))
})

test('Get serializerCompiler after setSerializerCompiler', t => {
  t.plan(2)
  const myCompiler = () => { }
  const fastify = Fastify()
  fastify.setSerializerCompiler(myCompiler)
  const sc = fastify.serializerCompiler
  t.ok(Object.is(myCompiler, sc))
  fastify.ready(err => t.error(err))
})

test('Get compilers is empty when settle on routes', t => {
  t.plan(3)

  const fastify = Fastify()

  fastify.post('/', {
    schema: {
      body: { type: 'object', properties: { hello: { type: 'string' } } },
      response: { '2xx': { foo: { type: 'array', items: { type: 'string' } } } }
    },
    validatorCompiler: ({ schema, method, url, httpPart }) => {},
    serializerCompiler: ({ schema, method, url, httpPart }) => {}
  }, function (req, reply) {
    reply.send('ok')
  })

  fastify.inject({
    method: 'POST',
    payload: {},
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.equal(fastify.validatorCompiler, null)
    t.equal(fastify.serializerCompiler, null)
  })
})

test('Should throw if the $id property is missing', t => {
  t.plan(1)
  const fastify = Fastify()
  try {
    fastify.addSchema({ type: 'string' })
    t.fail()
  } catch (err) {
    t.is(err.code, 'FST_ERR_SCH_MISSING_ID')
  }
})

test('Cannot add multiple times the same id', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.addSchema({ $id: 'id' })
  try {
    fastify.addSchema({ $id: 'id' })
  } catch (err) {
    t.is(err.code, 'FST_ERR_SCH_ALREADY_PRESENT')
    t.is(err.message, 'Schema with id \'id\' already declared!')
  }
})

test('Cannot add schema for query and querystring', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/', {
    handler: () => {},
    schema: {
      query: { foo: { type: 'string' } },
      querystring: { foo: { type: 'string' } }
    }
  })

  fastify.ready(err => {
    t.is(err.code, 'FST_ERR_SCH_DUPLICATE')
    t.is(err.message, 'Schema with \'querystring\' already present!')
  })
})

test('Should throw of the schema does not exists in input', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/:id', {
    handler: echoParams,
    schema: {
      params: {
        name: { $ref: '#notExist' }
      }
    }
  })

  fastify.ready(err => {
    t.is(err.code, 'FST_ERR_SCH_VALIDATION_BUILD')
    t.is(err.message, "Failed building the validation schema for GET: /:id, due to error can't resolve reference #notExist from id #")
  })
})

test('Should throw of the schema does not exists in output', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/:id', {
    handler: echoParams,
    schema: {
      response: {
        '2xx': {
          name: { $ref: '#notExist' }
        }
      }
    }
  })

  fastify.ready(err => {
    t.is(err.code, 'FST_ERR_SCH_SERIALIZATION_BUILD')
    t.is(err.message, "Failed building the serialization schema for GET: /:id, due to error Cannot read property 'type' of undefined") // error from fast-json-strinfigy
  })
})

test('Should not change the input schemas', t => {
  t.plan(4)

  const theSchema = {
    $id: 'helloSchema',
    type: 'object',
    definitions: {
      hello: { type: 'string' }
    }
  }

  const fastify = Fastify()
  fastify.post('/', {
    handler: echoBody,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { $ref: 'helloSchema#/definitions/hello' }
        }
      },
      response: {
        '2xx': {
          name: { $ref: 'helloSchema#/definitions/hello' }
        }
      }
    }
  })
  fastify.addSchema(theSchema)

  fastify.inject({
    url: '/',
    method: 'POST',
    payload: { name: 'Foo', surname: 'Bar' }
  }, (err, res) => {
    t.error(err)
    t.deepEqual(res.json(), { name: 'Foo' })
    t.ok(theSchema.$id, 'the $id is not removed')
    t.deepEqual(fastify.getSchema('helloSchema'), theSchema)
  })
})

test('First level $ref', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.get('/:id', {
    handler: (req, reply) => {
      reply.send({ id: req.params.id * 2, ignore: 'it' })
    },
    schema: {
      params: { $ref: 'test#' },
      response: {
        200: { $ref: 'test#' }
      }
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/123'
  }, (err, res) => {
    t.error(err)
    t.deepEqual(res.json(), { id: 246 })
  })
})

test('Customize validator compiler in instance and route', t => {
  t.plan(28)
  const fastify = Fastify()

  fastify.setValidatorCompiler(({ schema, method, url, httpPart }) => {
    t.equals(method, 'POST') // run 4 times
    t.equals(url, '/:id') // run 4 times
    switch (httpPart) {
      case 'body':
        t.pass('body evaluated')
        return body => {
          t.deepEqual(body, { foo: ['bar', 'BAR'] })
          return true
        }
      case 'params':
        t.pass('params evaluated')
        return params => {
          t.deepEqual(params, { id: 1234 })
          return true
        }
      case 'querystring':
        t.pass('querystring evaluated')
        return query => {
          t.deepEqual(query, { lang: 'en' })
          return true
        }
      case 'headers':
        t.pass('headers evaluated')
        return headers => {
          t.like(headers, { x: 'hello' })
          return true
        }
      case '2xx':
        t.fail('the validator doesn\'t process the response')
        break
      default:
        t.fail(`unknown httpPart ${httpPart}`)
    }
  })

  fastify.post('/:id', {
    handler: echoBody,
    schema: {
      query: { lang: { type: 'string', enum: ['it', 'en'] } },
      headers: { x: { type: 'string' } },
      params: { id: { type: 'number' } },
      body: { foo: { type: 'array' } },
      response: {
        '2xx': { foo: { type: 'array', items: { type: 'string' } } }
      }
    }
  })

  fastify.get('/wow/:id', {
    handler: echoParams,
    validatorCompiler: ({ schema, method, url, httpPart }) => {
      t.equals(method, 'GET') // run 3 times (params, headers, query)
      t.equals(url, '/wow/:id') // run 4 times
      return () => { return true } // ignore the validation
    },
    schema: {
      query: { lang: { type: 'string', enum: ['it', 'en'] } },
      headers: { x: { type: 'string' } },
      params: { id: { type: 'number' } },
      response: { '2xx': { foo: { type: 'array', items: { type: 'string' } } } }
    }
  })

  fastify.inject({
    url: '/1234',
    method: 'POST',
    headers: { x: 'hello' },
    query: { lang: 'en' },
    payload: { foo: ['bar', 'BAR'] }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.deepEqual(res.json(), { foo: ['bar', 'BAR'] })
  })

  fastify.inject({
    url: '/wow/should-be-a-num',
    method: 'GET',
    headers: { x: 'hello' },
    query: { lang: 'jp' } // not in the enum
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200) // the validation is always true
    t.deepEqual(res.json(), {})
  })
})

test('Use the same schema across multiple routes', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.get('/first/:id', {
    schema: {
      params: { id: { $ref: 'test#/properties/id' } }
    },
    handler: (req, reply) => {
      reply.send(typeof req.params.id)
    }
  })

  fastify.get('/second/:id', {
    schema: {
      params: { id: { $ref: 'test#/properties/id' } }
    },
    handler: (req, reply) => {
      reply.send(typeof req.params.id)
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/first/123'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.payload, 'number')
  })

  fastify.inject({
    method: 'GET',
    url: '/second/123'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.payload, 'number')
  })
})

test('Encapsulation should intervene', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.register((instance, opts, next) => {
    instance.addSchema({
      $id: 'encapsulation',
      type: 'object',
      properties: {
        id: { type: 'number' }
      }
    })
    next()
  })

  fastify.register((instance, opts, next) => {
    instance.get('/:id', {
      handler: echoParams,
      schema: {
        params: { id: { $ref: 'encapsulation#/properties/id' } }
      }
    })
    next()
  })

  fastify.ready(err => {
    t.is(err.code, 'FST_ERR_SCH_VALIDATION_BUILD')
    t.is(err.message, "Failed building the validation schema for GET: /:id, due to error can't resolve reference encapsulation#/properties/id from id #")
  })
})

test('Encapsulation isolation', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register((instance, opts, next) => {
    instance.addSchema({ $id: 'id' })
    next()
  })

  fastify.register((instance, opts, next) => {
    instance.addSchema({ $id: 'id' })
    next()
  })

  fastify.ready(err => t.error(err))
})

test('Add schema after register', t => {
  t.plan(5)

  const fastify = Fastify()
  fastify.register((instance, opts, next) => {
    instance.get('/:id', {
      handler: echoParams,
      schema: {
        params: { $ref: 'test#' }
      }
    })

    // add it to the parent instance
    fastify.addSchema({
      $id: 'test',
      type: 'object',
      properties: {
        id: { type: 'number' }
      }
    })

    try {
      instance.addSchema({ $id: 'test' })
    } catch (err) {
      t.is(err.code, 'FST_ERR_SCH_ALREADY_PRESENT')
      t.is(err.message, 'Schema with id \'test\' already declared!')
    }
    next()
  })

  fastify.inject({
    method: 'GET',
    url: '/4242'
  }, (err, res) => {
    t.error(err)
    t.equals(res.statusCode, 200)
    t.deepEqual(res.json(), { id: 4242 })
  })
})

test('Encapsulation isolation for getSchemas', t => {
  t.plan(5)
  const fastify = Fastify()

  let pluginDeepOneSide
  let pluginDeepOne
  let pluginDeepTwo

  const schemas = {
    z: { $id: 'z', my: 'schema' },
    a: { $id: 'a', my: 'schema' },
    b: { $id: 'b', my: 'schema' },
    c: { $id: 'c', my: 'schema', properties: { a: 'a', b: 1 } }
  }

  fastify.addSchema(schemas.z)

  fastify.register((instance, opts, next) => {
    instance.addSchema(schemas.a)
    pluginDeepOneSide = instance
    next()
  })

  fastify.register((instance, opts, next) => {
    instance.addSchema(schemas.b)
    instance.register((subinstance, opts, next) => {
      subinstance.addSchema(schemas.c)
      pluginDeepTwo = subinstance
      next()
    })
    pluginDeepOne = instance
    next()
  })

  fastify.ready(err => {
    t.error(err)
    t.deepEqual(fastify.getSchemas(), { z: schemas.z })
    t.deepEqual(pluginDeepOneSide.getSchemas(), { z: schemas.z, a: schemas.a })
    t.deepEqual(pluginDeepOne.getSchemas(), { z: schemas.z, b: schemas.b })
    t.deepEqual(pluginDeepTwo.getSchemas(), { z: schemas.z, b: schemas.b, c: schemas.c })
  })
})

test('Use the same schema id in different places', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'test',
    type: 'object',
    properties: {
      id: { type: 'number' }
    }
  })

  fastify.get('/:id', {
    handler: echoParams,
    schema: {
      response: {
        200: {
          type: 'array',
          items: { $ref: 'test#/properties/id' }
        }
      }
    }
  })

  fastify.post('/:id', {
    handler: echoBody,
    schema: {
      body: { id: { $ref: 'test#/properties/id' } },
      response: {
        200: { id: { $ref: 'test#/properties/id' } }
      }
    }
  })

  fastify.ready(err => t.error(err))
})

test('Get schema anyway should not add `properties` if allOf is present', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'first',
    type: 'object',
    properties: {
      first: { type: 'number' }
    }
  })

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    allOf: [
      {
        type: 'object',
        properties: {
          second: { type: 'number' }
        }
      },
      fastify.getSchema('first')
    ]
  })

  fastify.get('/', {
    handler: () => {},
    schema: {
      querystring: fastify.getSchema('second'),
      response: { 200: fastify.getSchema('second') }
    }
  })

  fastify.ready(err => t.error(err))
})

test('Get schema anyway should not add `properties` if oneOf is present', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'first',
    type: 'object',
    properties: {
      first: { type: 'number' }
    }
  })

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    oneOf: [
      {
        type: 'object',
        properties: {
          second: { type: 'number' }
        }
      },
      fastify.getSchema('first')
    ]
  })

  fastify.get('/', {
    handler: () => {},
    schema: {
      querystring: fastify.getSchema('second'),
      response: { 200: fastify.getSchema('second') }
    }
  })

  fastify.ready(err => t.error(err))
})

test('Get schema anyway should not add `properties` if anyOf is present', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'first',
    type: 'object',
    properties: {
      first: { type: 'number' }
    }
  })

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    anyOf: [
      {
        type: 'object',
        properties: {
          second: { type: 'number' }
        }
      },
      fastify.getSchema('first')
    ]
  })

  fastify.get('/', {
    handler: () => {},
    schema: {
      querystring: fastify.getSchema('second'),
      response: { 200: fastify.getSchema('second') }
    }
  })

  fastify.ready(err => t.error(err))
})

test('Shared schema should be ignored in string enum', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/:lang', {
    handler: echoParams,
    schema: {
      params: {
        type: 'object',
        properties: {
          lang: {
            type: 'string',
            enum: ['Javascript', 'C++', 'C#']
          }
        }
      }
    }
  })

  fastify.inject('/C%23', (err, res) => {
    t.error(err)
    t.deepEqual(res.json(), { lang: 'C#' })
  })
})

test('Shared schema should NOT be ignored in != string enum', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.addSchema({
    $id: 'C',
    type: 'object',
    properties: {
      lang: {
        type: 'string',
        enum: ['Javascript', 'C++', 'C#']
      }
    }
  })

  fastify.post('/:lang', {
    handler: echoBody,
    schema: {
      body: fastify.getSchema('C')
    }
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    payload: { lang: 'C#' }
  }, (err, res) => {
    t.error(err)
    t.deepEqual(res.json(), { lang: 'C#' })
  })
})

test('Case insensitive header validation', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.get('/', {
    handler: (req, reply) => {
      reply.code(200).send(req.headers.foobar)
    },
    schema: {
      headers: {
        type: 'object',
        required: ['FooBar'],
        properties: {
          FooBar: { type: 'string' }
        }
      }
    }
  })
  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      FooBar: 'Baz'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.payload, 'Baz')
  })
})

test('Not evaluate json-schema $schema keyword', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.post('/', {
    handler: echoBody,
    schema: {
      body: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        additionalProperties: false,
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
    }
  })
  fastify.inject({
    url: '/',
    method: 'POST',
    body: { hello: 'world', foo: 'bar' }
  }, (err, res) => {
    t.error(err)
    t.deepEqual(res.json(), { hello: 'world' })
  })
})

test('Validation context in validation result', t => {
  t.plan(5)
  const fastify = Fastify()
  // custom error handler to expose validation context in response, so we can test it later
  fastify.setErrorHandler((err, request, reply) => {
    t.equal(err instanceof Error, true)
    t.ok(err.validation, 'detailed errors')
    t.equal(err.validationContext, 'body')
    reply.send()
  })
  fastify.get('/', {
    handler: echoParams,
    schema: {
      body: {
        type: 'object',
        required: ['hello'],
        properties: {
          hello: { type: 'string' }
        }
      }
    }
  })
  fastify.inject({
    method: 'GET',
    url: '/',
    payload: {} // body lacks required field, will fail validation
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 400)
  })
})

test('The schema build should not modify the input', t => {
  t.plan(3)
  const fastify = Fastify()

  const first = {
    $id: 'first',
    type: 'object',
    properties: {
      first: {
        type: 'number'
      }
    }
  }

  fastify.addSchema(first)

  fastify.addSchema({
    $id: 'second',
    type: 'object',
    allOf: [
      {
        type: 'object',
        properties: {
          second: {
            type: 'number'
          }
        }
      },
      { $ref: 'first#' }
    ]
  })

  fastify.get('/', {
    schema: {
      description: 'get',
      body: { $ref: 'second#' },
      response: {
        200: { $ref: 'second#' }
      }
    },
    handler: (request, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.patch('/', {
    schema: {
      description: 'patch',
      body: { $ref: 'first#' },
      response: {
        200: { $ref: 'first#' }
      }
    },
    handler: (request, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  t.ok(first.$id)
  fastify.ready(err => {
    t.error(err)
    t.ok(first.$id)
  })
})

test('Cross schema reference with encapsulation references', t => {
  t.plan(1)

  const fastify = Fastify()
  fastify.addSchema({ $id: 'http://foo/item', type: 'object', properties: { foo: { type: 'string' } } })

  const refItem = { $ref: 'http://foo/item#' }

  fastify.addSchema({
    $id: 'itemList',
    type: 'array',
    items: refItem
  })

  fastify.register((instance, opts, next) => {
    instance.addSchema({
      $id: 'encapsulation',
      type: 'object',
      properties: {
        id: { type: 'number' },
        item: refItem,
        secondItem: refItem
      }
    })

    const multipleRef = {
      type: 'object',
      properties: {
        a: { $ref: 'itemList#' },
        b: refItem,
        c: refItem,
        d: refItem
      }
    }

    instance.get('/get', { schema: { response: { 200: multipleRef } } }, () => { })
    instance.get('/double-get', { schema: { body: multipleRef, response: { 200: multipleRef } } }, () => { })
    instance.post('/post', { schema: { body: multipleRef, response: { 200: multipleRef } } }, () => { })
    instance.post('/double', { schema: { response: { 200: { $ref: 'encapsulation' } } } }, () => { })
    next()
  }, { prefix: '/foo' })

  fastify.post('/post', { schema: { body: refItem, response: { 200: refItem } } }, () => { })
  fastify.get('/get', { schema: { body: refItem, response: { 200: refItem } } }, () => { })

  fastify.ready(err => {
    t.error(err)
  })
})

test('Check how many AJV instances are built #1', t => {
  t.plan(12)
  const fastify = Fastify()
  addRandomRoute(fastify) // this trigger the schema validation creation
  t.notOk(fastify.validatorCompiler, 'validator not initialized')

  const instances = []
  fastify.register((instance, opts, next) => {
    t.notOk(fastify.validatorCompiler, 'validator not initialized')
    instances.push(instance)
    next()
  })
  fastify.register((instance, opts, next) => {
    t.notOk(fastify.validatorCompiler, 'validator not initialized')
    addRandomRoute(instance)
    instances.push(instance)
    next()
    instance.register((instance, opts, next) => {
      t.notOk(fastify.validatorCompiler, 'validator not initialized')
      addRandomRoute(instance)
      instances.push(instance)
      next()
    })
  })

  fastify.ready(err => {
    t.error(err)

    t.ok(fastify.validatorCompiler, 'validator initialized on preReady')
    fastify.validatorCompiler.checkPointer = true
    instances.forEach(i => {
      t.ok(i.validatorCompiler, 'validator initialized on preReady')
      t.equals(i.validatorCompiler.checkPointer, true, 'validator is only one for all the instances')
    })
  })
})

test('Check how many AJV instances are built #2 - verify validatorPool', t => {
  t.plan(13)
  const fastify = Fastify()
  t.notOk(fastify.validatorCompiler, 'validator not initialized')

  fastify.register(function sibling1 (instance, opts, next) {
    addRandomRoute(instance)
    t.notOk(instance.validatorCompiler, 'validator not initialized')
    instance.ready(() => {
      t.ok(instance.validatorCompiler, 'validator is initialized')
      instance.validatorCompiler.sharedPool = 1
    })
    instance.after(() => {
      t.notOk(instance.validatorCompiler, 'validator not initialized')
    })
    next()
  })

  fastify.register(function sibling2 (instance, opts, next) {
    addRandomRoute(instance)
    t.notOk(instance.validatorCompiler, 'validator not initialized')
    instance.ready(() => {
      t.equals(instance.validatorCompiler.sharedPool, 1, 'this context must share the validator with the same schemas')
      instance.validatorCompiler.sharedPool = 2
    })
    instance.after(() => {
      t.notOk(instance.validatorCompiler, 'validator not initialized')
    })

    instance.register((instance, opts, next) => {
      t.notOk(instance.validatorCompiler, 'validator not initialized')
      instance.ready(() => {
        t.equals(instance.validatorCompiler.sharedPool, 2, 'this context must share the validator of the parent')
      })
      next()
    })
    next()
  })

  fastify.register(function sibling3 (instance, opts, next) {
    addRandomRoute(instance)

    // this trigger to dont't reuse the same compiler pool
    instance.addSchema({ $id: 'diff', type: 'object' })

    t.notOk(instance.validatorCompiler, 'validator not initialized')
    instance.ready(() => {
      t.ok(instance.validatorCompiler, 'validator is initialized')
      t.notOk(instance.validatorCompiler.sharedPool, 'this context has its own compiler')
    })
    next()
  })

  fastify.ready(err => { t.error(err) })
})

function addRandomRoute (server) {
  server.get(`/${Math.random()}`,
    { schema: { body: { type: 'object' } } },
    (req, reply) => reply.send()
  )
}

test('Add schema order should not break the startup', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/', { schema: { random: 'options' } }, () => {})

  fastify.register(fp((f, opts) => {
    f.addSchema({
      $id: 'https://example.com/bson/objectId',
      type: 'string',
      pattern: '\\b[0-9A-Fa-f]{24}\\b'
    })
    return Promise.resolve() // avoid async for node 6
  }))

  fastify.get('/:id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { $ref: 'https://example.com/bson/objectId#' }
        }
      }
    }
  }, () => {})

  fastify.ready(err => { t.error(err) })
})
