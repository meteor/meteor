Package.describe({
  summary: "Crypto-JS 2.5.3"
});

Package.on_use(function (api) {
  api.add_files('aes/aes.js', 'client');
  api.add_files('blockmodes/blockmodes-min.js', 'client');
  api.add_files('crypto/crypto-min.js', 'client');
  api.add_files('crypto-md5/crypto-md5.js', 'client');
  api.add_files('crypto-md5-hmac/crypto-md5-hmac.js', 'client');
  api.add_files('crypto-sha1/crypto-sha1.js', 'client');
  api.add_files('crypto-sha1-hmac/crypto-sha1-hmac.js', 'client');
  api.add_files('crypto-sha1-hmac-pbkdf2/crypto-sha1-hmac-pbkdf2.js', 'client');
  api.add_files('crypto-sha1-hmac-pbkdf2-blockmodes-aes/crypto-sha1-hmac-pbkdf2-blockmodes-aes.js', 'client');  
  api.add_files('crypto-sha1-hmac-pbkdf2-blockmodes-des/crypto-sha1-hmac-pbkdf2-blockmodes-des.js', 'client');  
  api.add_files('crypto-sha1-hmac-pbkdf2-marc4/crypto-sha1-hmac-pbkdf2-marc4.js', 'client');  
  api.add_files('crypto-sha1-hmac-pbkdf2-rabbit/crypto-sha1-hmac-pbkdf2-rabbit.js', 'client');
  api.add_files('crypto-sha1-hmac-pbkdf2async/crypto-sha1-hmac-pbkdf2async.js', 'client');    
  api.add_files('crypto-sha256/crypto-sha256.js', 'client');
  api.add_files('crypto-sha256-hmac/crypto-sha256-hmac.js', 'client');
  api.add_files('des/des-min.js', 'client');
  api.add_files('hmac/hmac-min.js', 'client');
  api.add_files('marc4/marc4-min.js', 'client');
  api.add_files('md5/md5-min.js', 'client');
  api.add_files('pbkdf2/pbkdf2-min.js', 'client');  
  api.add_files('pbkdf2async/pbkdf2async-min.js', 'client');
  api.add_files('rabbit/rabbit-min.js', 'client');
  api.add_files('sha1/sha1-min.js', 'client');
  api.add_files('sha256/sha256-min.js', 'client')
});
