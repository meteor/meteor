#! /usr/bin/env ruby

# This script takes two arguments:
# 1. The name of an export - ex. EJSON
# 2. The name of a package - ex. ejson
# It makes sure that if the export appears somewhere in package source code, the
# name of the package appears somewhere in package.js for that package.

root = File.join(File.dirname(__FILE__), "..", "..");

Dir.chdir(root)

file_list = `git grep -lw '#{ARGV[0]}' packages/`.lines
package_list = file_list.map do |filename|
  filename.split("/")[1]
end

package_list = package_list.uniq

package_list.each do |p|
  unless File.open("packages/#{p}/package.js").read.include? ARGV[1]
    puts "'#{ARGV[0]}' appears in #{p} but '#{ARGV[1]}' not in package.js. Files:"
    puts `git grep '#{ARGV[0]}' packages/#{p}/`
    puts ""
  end
end
