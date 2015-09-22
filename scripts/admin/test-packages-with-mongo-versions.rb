#! /usr/bin/env ruby

# This script downloads and installs any number of versions of Mongo, and runs
# the console version of test-packages on them. The test output is stored in a
# directory called "mongo-test-output" in the root of your checkout.

require 'tmpdir'

mongo_install_urls = {
  "3.0.5" => "https://fastdl.mongodb.org/osx/mongodb-osx-x86_64-3.0.5.tgz",
  "2.6.10" => "http://downloads.mongodb.org/osx/mongodb-osx-x86_64-2.6.10.tgz",
  "2.4.14" => "http://downloads.mongodb.org/osx/mongodb-osx-x86_64-2.4.14.tgz"
}

mongo_port = "12345"

dirname = File.dirname(__FILE__)
path_to_test_in_console = File.realpath File.join dirname, "..", "..", "packages", "test-in-console", "run.sh"
path_to_output = File.realpath File.join dirname, "..", "..", "mongo-test-output"

unless Dir[path_to_output]
  Dir.mkdir path_to_output
end

puts "Putting output in: #{path_to_output}/"

["3.0.5", "2.6.10", "2.4.14"].each do |mongo_version|
  puts "Installing and testing with Mongo #{mongo_version}..."

  Dir.mktmpdir "mongo_install" do |mongo_install_dir|
    Dir.chdir mongo_install_dir do
      `curl -O #{mongo_install_urls[mongo_version]}`
      `tar -zxvf mongodb-osx-x86_64-#{mongo_version}.tgz`
      `mkdir -p db`

      pid = fork do
        exec "./mongodb-osx-x86_64-#{mongo_version}/bin/mongod --dbpath db --port #{mongo_port}"
      end

      sleep(3)

      mongo_env = "MONGO_URL=mongodb://localhost:#{mongo_port}/test_db"

      puts "Running test-in-console from: #{path_to_test_in_console}"
      puts "Passing #{mongo_env}"
      `#{mongo_env} bash #{path_to_test_in_console} > #{path_to_output}/#{mongo_version}.txt`

      # Kill Mongo
      Process.kill "TERM", pid
    end
  end
end
