pipeline {
  agent any
  stages {
    stage('Get Ready') {
      steps {
        sh '''pushd tools
# Ensure that meteor/tools has no TypeScript errors.
echo "typescript compiler starting"
../meteor npx tsc --noEmit
echo "typescript compiler finished"
popd
echo "meteor get-ready starting"
NODE_OPTIONS="--max-old-space-size=2048" METEOR_PROFILE=1000 ./meteor --get-ready
echo "meteor get-ready finished"'''
      }
    }

    stage('Selftest 0-20') {
      parallel {
        stage('Selftest 0-20') {
          steps {
            sh '''./meteor self-test \\
              --headless \\
              --without-tag "custom-warehouse" \\
              --retries 0 \\
              --exclude "add debugOnly and prodOnly packages" \\
              --limit 20 \\
              --skip 0'''
          }
        }

        stage('Selftest 21-40') {
          steps {
            sh '''./meteor self-test \\
              --headless \\
              --without-tag "custom-warehouse" \\
              --retries 0 \\
              --exclude "add debugOnly and prodOnly packages" \\
              --limit 20 \\
              --skip 20'''
          }
        }

        stage('Selftest 41-60') {
          steps {
            sh '''./meteor self-test \\
              --headless \\
              --without-tag "custom-warehouse" \\
              --retries 0 \\
              --exclude "add debugOnly and prodOnly packages" \\
              --limit 20 \\
              --skip 40'''
          }
        }

        stage('Selftest 61-80') {
          steps {
            sh '''./meteor self-test \\
              --headless \\
              --without-tag "custom-warehouse" \\
              --retries 0 \\
              --exclude "add debugOnly and prodOnly packages" \\
              --limit 20 \\
              --skip 60'''
          }
        }

        stage('Selftest 81-100') {
          steps {
            sh '''./meteor self-test \\
              --headless \\
              --without-tag "custom-warehouse" \\
              --retries 0 \\
              --exclude "add debugOnly and prodOnly packages" \\
              --limit 20 \\
              --skip 80'''
          }
        }

        stage('Selftest 101-120') {
          steps {
            sh '''./meteor self-test \\
              --headless \\
              --without-tag "custom-warehouse" \\
              --retries 0 \\
              --exclude "add debugOnly and prodOnly packages" \\
              --limit 20 \\
              --skip 100'''
          }
        }

        stage('Selftest >121') {
          steps {
            sh '''./meteor self-test \\
              --headless \\
              --without-tag "custom-warehouse" \\
              --retries 0 \\
              --exclude "add debugOnly and prodOnly packages" \\
              --limit 0 \\
              --skip 120'''
          }
        }

      }
    }

  }
}