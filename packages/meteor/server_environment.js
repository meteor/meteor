Meteor = {
  is_client: false,
  is_server: true
  is_development: process.env.METEOR_ENV === 'development',
  is_staging: process.env.METEOR_ENV === 'staging',
  is_production: process.env.METEOR_ENV === 'production'
};
