# OAuth Services Configuration

Meteor provides built-in support for OAuth authentication with several popular services. This guide will help you set up OAuth providers for your Meteor application.

## Configuration

After registering your application with an OAuth provider, you need to configure the credentials in your Meteor app. There are several ways to do this:

### Using settings.json (Recommended)

In your `settings.json` add:

```json
{
  "packages": {
    "service-configuration": {
      "facebook": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_APP_SECRET"
      },
      "google": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      },
      "github": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      },
      "twitter": {
        "consumerKey": "YOUR_CONSUMER_KEY",
        "secret": "YOUR_CONSUMER_SECRET"
      },
      "meetup": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      },
      "weibo": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      },
      "meteor-developer": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

> Another optional setting by each service is `loginStyle` which can be set to `redirect` or `popup`.

Then start your app with:

```bash
meteor --settings settings.json
```

In addition to the official services, you can also configure community/custom OAuth services through the `service-configuration` package as well.

### Using ServiceConfiguration (Programmatic)

You can also configure OAuth services programmatically in your server code:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

// Configure Facebook
ServiceConfiguration.configurations.upsertAsync(
  { service: 'facebook' },
  {
    $set: {
      appId: 'YOUR_APP_ID',
      secret: 'YOUR_APP_SECRET'
    }
  }
);

// Configure Google
ServiceConfiguration.configurations.upsertAsync(
  { service: 'google' },
  {
    $set: {
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET'
    }
  }
);
```

## Facebook

### Setting up Facebook OAuth

1. Visit [https://developers.facebook.com/apps](https://developers.facebook.com/apps)

2. Click **"Create App"** and fill out the required information.

3. In **Use cases** select **Authenticate and request data from users with Facebook Login**

4. In the app dashboard, click **"Add Product"** and find **"Facebook Login"**, then click **"Set Up"**

5. Select **"Web"** as your platform

6. In the **"Facebook Login > Settings"** from the left sidebar, set **"Valid OAuth Redirect URIs"** to `YOUR_SITE_URL/_oauth/facebook` (e.g., `http://localhost:3000/_oauth/facebook`) and click **"Save Changes"**

7. Go to **"Settings > Basic"** in the left sidebar

8Note down your **"App ID"** and **"App Secret"** (click **"Show"** to reveal the App Secret). You'll need these for configuration

### Configuration

Add to your `settings.json`:

```json
{
  "packages": {
    "service-configuration": {
      "facebook": {
        "appId": "YOUR_APP_ID",
        "secret": "YOUR_APP_SECRET"
      }
    }
  }
}
```

Or configure programmatically:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'facebook' },
  {
    $set: {
      appId: 'YOUR_APP_ID',
      secret: 'YOUR_APP_SECRET'
    }
  }
);
```

## Google

### Setting up Google OAuth

1. Visit [https://console.cloud.google.com/](https://console.cloud.google.com/)

2. Create a new project or select an existing one

3. In the left sidebar, go to **"APIs & Services" > "OAuth consent screen"**

4. Configure the consent screen: select **"External"** user type, enter your app name, user support email, and developer contact email, then click **"Save and Continue"**

5. Skip the **"Scopes"** step (or add scopes if needed) and click **"Save and Continue"**

6. Add test users if needed, then click **"Save and Continue"**

7. In the left sidebar, go to **"Credentials"** and click **"Create Credentials" > "OAuth client ID"**

8. Select **"Web application"** as the application type

9. Add your site URL to **"Authorized JavaScript origins"** (e.g., `http://localhost:3000`)

10. Add `YOUR_SITE_URL/_oauth/google` to **"Authorized redirect URIs"** (e.g., `http://localhost:3000/_oauth/google`)

11. Click **"Create"** and note down your **"Client ID"** and **"Client Secret"** from the popup

### Configuration

Add to your `settings.json`:

```json
{
  "packages": {
    "service-configuration": {
      "google": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

Or configure programmatically:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'google' },
  {
    $set: {
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET'
    }
  }
);
```

## GitHub

### Setting up GitHub OAuth

1. Visit [https://github.com/settings/applications/new](https://github.com/settings/applications/new)

2. Set **Homepage URL** to your site URL (e.g., `http://localhost:3000` for development or `https://yourdomain.com` for production)

3. Set **Authorization callback URL** to `YOUR_SITE_URL/_oauth/github` (e.g., `http://localhost:3000/_oauth/github`)

4. Click **"Register application"**

5. Note down your **Client ID** and **Client Secret**

### Configuration

Add to your `settings.json`:

```json
{
  "packages": {
    "service-configuration": {
      "github": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

Or configure programmatically:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'github' },
  {
    $set: {
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET'
    }
  }
);
```

## X/Twitter

### Setting up X/Twitter OAuth

1. Visit [https://developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard) and sign in

2. Create a new project and app (or select an existing one)

3. In your app settings, click on **"Set up"** under **"User authentication settings"**

4. Enable **"OAuth 1.0a"** (required for Meteor)

5. Set **"Callback URI / Redirect URL"** to `YOUR_SITE_URL/_oauth/twitter` (e.g., `http://localhost:3000/_oauth/twitter`)

6. Set **"Website URL"** to your site URL (e.g., `http://localhost:3000`)

7. Click **"Save"**

8. Go to the **"Keys and tokens"** tab and note down your **"API Key"** (Consumer Key) and **"API Key Secret"** (Consumer Secret)

### Configuration

Add to your `settings.json`:

```json
{
  "packages": {
    "service-configuration": {
      "twitter": {
        "consumerKey": "YOUR_CONSUMER_KEY",
        "secret": "YOUR_CONSUMER_SECRET"
      }
    }
  }
}
```

Or configure programmatically:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'twitter' },
  {
    $set: {
      consumerKey: 'YOUR_CONSUMER_KEY',
      secret: 'YOUR_CONSUMER_SECRET'
    }
  }
);
```

## Meetup

### Setting up Meetup OAuth

1. Visit [https://www.meetup.com/api/oauth/list/](https://www.meetup.com/api/oauth/list//) and sign in

2. Click **"Create new client"**

3. Set the **"Client name"** to the name of your application

4. Set the **"Application Website"** to your site URL

5. Set the **"Redirect URI"** to your site URL (e.g., `http://localhost:3000`). **Do not append a path to this URL**

6. Fill out all the other required fields.

7. Click **"Create"** and note down your **"Key"** (Client ID) and **"Secret"** (Client Secret)

### Configuration

Add to your `settings.json`:

```json
{
  "packages": {
    "service-configuration": {
      "meetup": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

Or configure programmatically:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'meetup' },
  {
    $set: {
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET'
    }
  }
);
```

## Weibo

> Weibo is currently deprecated and the team is looking for maintainers for this package.

### Setting up Weibo OAuth


1. Visit [https://open.weibo.com/apps](https://open.weibo.com/apps) and sign in (Google Chrome's automatic translation works well here)

2. Click **"创建应用"** (Create Application) and select **"网页应用"** (Web Application)

3. Complete the registration form with your app details

4. Complete the email verification process

5. In your app dashboard, go to **"应用信息" > "高级信息"** (Application Info > Advanced Information)

6. Set **"OAuth2.0 授权回调页"** (OAuth2.0 Redirect URI) to `YOUR_SITE_URL/_oauth/weibo` (e.g., `http://localhost:3000/_oauth/weibo`)

7. In **"应用信息" > "基本信息"** (Application Info > Basic Information), note down your **"App Key"** (Client ID) and **"App Secret"** (Client Secret)

### Configuration

Add to your `settings.json`:

```json
{
  "packages": {
    "service-configuration": {
      "weibo": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

Or configure programmatically:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'weibo' },
  {
    $set: {
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET'
    }
  }
);
```

## Meteor Developer Accounts

### Setting up Meteor Developer OAuth

1. Visit [https://beta.galaxycloud.app/](https://beta.galaxycloud.app/) and sign in

2. Go to **Settings** -> **Authorized Domains** and **Add New Domain**


3. Set the **"OAuth Redirect URL"** to `YOUR_SITE_URL/_oauth/meteor-developer` (e.g., `http://localhost:3000/_oauth/meteor-developer`)

4. Click **"Create"** and note down your **"Client ID"** and **"Client Secret"**

### Configuration

Add to your `settings.json`:

```json
{
  "packages": {
    "service-configuration": {
      "meteor-developer": {
        "clientId": "YOUR_CLIENT_ID",
        "secret": "YOUR_CLIENT_SECRET"
      }
    }
  }
}
```

Or configure programmatically:

```javascript
import { ServiceConfiguration } from 'meteor/service-configuration';

await ServiceConfiguration.configurations.upsertAsync(
  { service: 'meteor-developer' },
  {
    $set: {
      clientId: 'YOUR_CLIENT_ID',
      secret: 'YOUR_CLIENT_SECRET'
    }
  }
);
```

## Community services

You can add settings for community OAuth providers in the same manner as above. Just check with their documentation for the naming of the keys and any other exceptional behavior.
If those providers have `*-config-ui` you can find the instructions there.