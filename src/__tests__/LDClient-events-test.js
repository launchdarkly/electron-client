import * as LDClient from '../index';

const { TestHttpHandlers, TestHttpServers, withCloseable } = require('launchdarkly-js-test-helpers');

describe('LDClient', () => {
  const envName = 'UNKNOWN_ENVIRONMENT_ID';
  const user = { key: 'user' };

  // Event generation in general is tested in a non-platform-specific way in launchdarkly-js-sdk-common.
  // The following tests just demonstrate that the common client calls our platform object when it
  // should.

  describe('event generation', () => {
    // This tests that the client calls our platform's getCurrentUrl() and isDoNotTrack() methods.
    it('sends an event for track()', async () => {
      await withCloseable(TestHttpServers.start, async server => {
        const config = { bootstrap: {}, eventsUrl: server.url, diagnosticOptOut: true };
        const client = LDClient.initializeInMain(envName, user, config);
        await withCloseable(client, async () => {
          const data = { thing: 'stuff' };
          await client.waitForInitialization();

          client.track('eventkey', data);
          await client.flush();

          const req = await server.nextRequest();
          expect(req.path).toEqual('/events/bulk/' + envName);
          const events = JSON.parse(req.body);
          expect(events.length).toEqual(2); // first is identify event
          const trackEvent = events[1];
          expect(trackEvent.kind).toEqual('custom');
          expect(trackEvent.key).toEqual('eventkey');
          expect(trackEvent.userKey).toEqual(user.key);
          expect(trackEvent.data).toEqual(data);
          expect(trackEvent.url).toEqual(null);
        });
      });
    });
  });

  describe('diagnostic events', () => {
    it('sends diagnostic init event', async () => {
      await withCloseable(TestHttpServers.start, async server => {
        server.byDefault(TestHttpHandlers.respond(202));
        const config = { bootstrap: {}, eventsUrl: server.url };
        const client = LDClient.initializeInMain(envName, user, config);
        await withCloseable(client, async () => {
          // There will be two requests: one for the initial "identify" event that the client always sends, and
          // one for "diagnostic-init". The diagnostic one should normally appear first but you never know.
          const req0 = await server.nextRequest();
          const req1 = await server.nextRequest();
          const req = req0.path.startsWith('/events/diagnostic/') ? req0 : req1;

          expect(req.path).toEqual('/events/diagnostic/' + envName);
          const data = JSON.parse(req.body);
          expect(data.kind).toEqual('diagnostic-init');
          expect(data.platform).toMatchObject({
            name: 'Electron',
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
          });
          expect(data.sdk).toMatchObject({
            name: 'electron-client-sdk',
          });
        });
      });
    });
  });
});