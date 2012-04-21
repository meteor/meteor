Package.describe({
  summary: "Manipulate the DOM using CSS selectors - served via Google CDN"
});

Package.on_use(function (api) {
  api.add_head_extra('  <script src="https://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js"></script>', 'client');
});
