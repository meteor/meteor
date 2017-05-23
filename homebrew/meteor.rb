require 'formula'

class Meteor < Formula
  homepage 'http://www.meteor.com'
  url 'http://d3sqy0vbqsdhku.cloudfront.net/meteor-package-Darwin-x86_64-0.3.6.tar.gz'
  md5 'c5c7530a59f871fb9790ae9be9ea0a7b'

  def startup_script
    <<-EOS
#!/bin/bash
exec "#{libexec}/bin/meteor" "$@"
EOS
  end

  def install
    libexec.install Dir['*']
    (libexec+'meteor').write startup_script
    (libexec+'meteor').chmod 0755
    bin.install_symlink libexec+'meteor'
  end
end
