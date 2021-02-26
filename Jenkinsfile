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
./meteor --get-ready
echo "meteor get-ready finished"'''
      }
    }

  }
}