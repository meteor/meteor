Meteor = {
  is_client: true,
  is_server: false,
  is_development: __meteor_runtime_config__.METEOR_ENV === 'development',
  is_staging: __meteor_runtime_config__.METEOR_ENV === 'staging',
  is_production: __meteor_runtime_config__.METEOR_ENV === 'production'
};

