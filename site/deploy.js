var fs = require('fs')
var path = require('path')
var exec = require('child_process').exec
var s3sync = require('s3-sync')
var readdirp = require('readdirp')

var s3Options = {
  key: process.env.AWS_KEY,
  secret: process.env.AWS_SECRET,
  bucket: 'guide.meteor.com',
  region: 'us-east-1'
}

if (!(s3Options.key && s3Options.secret)) {
  var config
  try {
    config = require('./keys.json')
  } catch (e) {
    console.warn(
      'You must provide the AWS keys as either env vars or in keys.json.'
    )
    process.exit(1)
  }
  s3Options.key = config.key
  s3Options.secret = config.secret
}

getGitBranch()
  // .then(updateHexoConfig)
  .then(generateSite)
  .then(deployToS3)
  .catch(function (err) {
    console.warn(err)
  })

function getGitBranch () {
  return new Promise(function (resolve, reject) {
    exec('git status', function (err, out) {
      if (err) return reject(err)
      var branch = out.toString().match(/^On branch (.+)/)[1]
      if (branch === 'master') {
        resolve('')
      } else {
        var versionMatch = branch.match(/^version-(.*)/)
        resolve(versionMatch ? 'v' + versionMatch[1] : 'branch-' + branch)
      }
    })
  })
}

function updateHexoConfig (branch) {
  if (!branch) {
    return Promise.resolve(branch)
  } else {
    console.log('Updating hexo config...')
    return new Promise(function (resolve, reject) {
      fs.readFile('_config.yml', 'utf-8', function (err, content) {
        if (err) return reject(err)
        function replacer (m) {
          return m.slice(0, -1) + branch + '/\n'
        }
        content = content
          .replace('\nurl: http://guide.meteor.com/\n', replacer)
          .replace('\nroot: /\n', replacer)
        fs.writeFile('_config.yml', content, function (err) {
          if (err) return reject(err)
          console.log('done.')
          resolve(branch)
        })
      })
    })
  }
}

function generateSite (branch) {
  console.log('Generating static site...')
  return new Promise(function (resolve, reject) {
    exec('hexo generate', function (err) {
      if (err) return reject(err)
      console.log('done.')
      resolve(branch)
    })
  })
}

function deployToS3 (branch) {
  console.log('deploying to S3...')
  s3Options.prefix = branch ? branch + '/' : ''
  var fileOptions = { root: 'public' }
  // for non-master branches, we can skip assets
  // and just upload html files.
  if (branch) {
    fileOptions.fileFilter = '*.html'
  }
  readdirp(fileOptions)
    .pipe(s3sync(s3Options).on('data', function(file) {
      console.log(file.path + ' -> ' + file.url)
    }).on('end', function() {
      console.log('All done!')
    }).on('fail', function(err) {
      console.warn(err)
    }))
}
