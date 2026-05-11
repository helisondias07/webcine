import React from "react";

const mdStyle: React.CSSProperties = {
  maxWidth: "100vw",
  width: "800px",
  padding: "10px",
};

export const Privacy = () => {
  return (
    <div style={mdStyle}>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {`
Privacy Policy
====

Rooms
----
- By default, rooms are temporary and expire after one day of inactivity.
- Users have the option of making a room permanent, which can be undone at any time.
- We do not keep logs of the content that users watch.

Personal Information
----
- You are not required to register to use the service, but you have the option to sign in with an email or authentication provider, which will be used to display your name and picture in the rooms you join.
- If you provide this information, we may use it to contact you regarding your use of the service, or to link your account to a subscription.
- We do not sell personal information to third parties.
- You have the right to request deletion of your user data, in accordance with various laws governing data protection. Please contact support@webcinetv.app to request user data deletion.
- Payment information is handled by providers such as Stripe. We do not collect or access financial information directly.

Cookies
----
- We use services such as Google Analytics to measure usage. These services may set cookies or other information locally on your device.

YouTube
----
- The service provides the ability to search and play YouTube videos. Google/YouTube may use data provided to the search service in accordance with the [Google Privacy Policy](https://policies.google.com/privacy).
`}
      </pre>
    </div>
  );
};

export const Terms = () => {
  return (
    <div style={mdStyle}>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {`
Terms of Service
====
By using this service you agree to the following terms:
- You are over 13 years of age
- Your use of the service may be terminated if you are found to be sharing illegal or infringing content
- The service provides no guarantee of uptime or availability
- You use the service at your own risk of encountering objectionable content, as we do not actively moderate rooms unless content is found to be illegal or infringing

Subscriptions
----
- If you are dissatisfied with the service for any reason or believe you have been charged in error, please contact support@webcinetv.app.
- We will provide a full refund of the most recent payment, no questions asked.

YouTube
----
The service provides the ability to search and play YouTube videos. By using the YouTube search you agree to the [YouTube Terms of Service](https://www.youtube.com/t/terms).
`}
      </pre>
    </div>
  );
};

export const FAQ = () => {
  return (
    <div style={mdStyle}>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {`
FAQ
====
How come I'm not getting any audio when screensharing?
----
To share audio, you must be using Chrome/Edge and sharing a tab or desktop.

Is there a limit to how many people can be in a room?
----
Currently there isn't a hard limit, although the service hasn't been tested with more than 15 people or so. Screensharing and filesharing rely on one person uploading to everyone else, so it may not work well with large room sizes.

I own a website and I'd like to have a link that generates a WebCineTV room with a specific video already set. How do I do this?
----
You can link to /create?video=URL_HERE to do this.

`}
      </pre>
    </div>
  );
};
