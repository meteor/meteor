

const meteorEnvRegEx = /^eslint-meteor-env (browser|client|cordova|server)\s?(,\s?(browser|client|cordova|server))*$/

export default function (comments = []) {
  let executors = new Set()
  comments.forEach(comment => {
    const trimmedValue = comment
      .value
      .replace(/\s\s+/g, ' ') // multiple spaces and newlines to one space
      .trim()
    if (meteorEnvRegEx.test(trimmedValue)) {
      trimmedValue
        .substr(18)
        .replace(/\s+/g, '')
        .split(',')
        .map(executor => {
          switch (executor) {

            // client is a shortcut for browser, cordova
            case 'client':
              executors.add('browser')
              executors.add('cordova')
              break
            case 'browser':
              executors.add('browser')
              break
            case 'cordova':
              executors.add('cordova')
              break
            case 'server':
              executors.add('server')
              break
          }
        })
    }
  })
  return executors
}
