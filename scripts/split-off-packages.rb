#! /usr/bin/env ruby

root = File.join(File.dirname(__FILE__), "..");

Dir.chdir(root)

target_branch = ARGV[0]
packages_to_split_off = ARGV.drop(1)

def temp_branch_for_packages(package)
  "#{package.gsub(":", "_")}_split_off_temp"
end

current_branch = `git rev-parse --abbrev-ref HEAD`

for package in packages_to_split_off do
  temp_branch_for_package = temp_branch_for_packages(package)
  `git branch -D #{temp_branch_for_package}`
  `git subtree split --prefix="packages/#{package}" --branch=#{temp_branch_for_package}`
end

`git branch -D #{target_branch}`
`git checkout --orphan #{target_branch}`
`git rm --cached -r .`
`git clean -fdx`
`git commit --no-verify --allow-empty -m "Initial commit"`

for package in packages_to_split_off do
  temp_branch_for_package = temp_branch_for_packages(package)
  `git subtree add --prefix="packages/#{package}" #{temp_branch_for_package}`
  `git branch -D #{temp_branch_for_package}`
end

`git checkout #{current_branch}`
