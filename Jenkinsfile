pipeline {
  agent any
  stages {
    stage('Get Ready') {
      steps {
        sh 'sh scripts/ci/run-selftest-ci.sh'
      }
    }

  }
}