const each = require('async-each');
const queryString = require('querystring');
const createNodeHelpers = require('gatsby-node-helpers').default;
const eventbrite = require('eventbrite').default;

const { createNodeFactory } = createNodeHelpers({
  typePrefix: `Eventbrite`
});

const EventNode = createNodeFactory('Event', node => {
  // HACK: since types are inferred we need to mock them or queries fail
  node.venue = node.venue || {
    id: '',
    name: '',
    address: {
      localized_address_display: ''
    }
  };
  return node;
});

exports.sourceNodes = async function(
  { actions: { createNode, setPluginStatus } },
  { query, token, organizationId }
) {
  if (!token) {
    throw new Error('Missing Eventbrite OAuth token');
  }

  if (!organizationId) {
    throw new Error(
      'Missing Eventbrite Organization Id. Please refer to the v2 migration guide in ./README.md'
    );
  }
  const sdk = eventbrite({ token });
  try {
    const { events } = await sdk.request(
      `/organizations/${organizationId}/events/?${queryString.stringify(query)}`
    );

    const fullEvents = await new Promise((resolve, reject) => {
      each(
        events,
        async (item, next) => {
          const { modules } = await sdk.request(
            `/events/${item.id}/structured_content/?purpose=listing`
          );

          const description = modules
            .filter(module => module.type === 'text')
            .map(module => module.data.body.text)
            .join('');

          next(null, { ...item, description });
        },
        (err, res) => {
          if (err) reject(err);
          resolve(res);
        }
      );
    });

    fullEvents
      .map(event => EventNode(event))
      .forEach(eventNode => createNode(eventNode));

    setPluginStatus({ lastFetched: new Date() });
  } catch (err) {
    console.error('EB Fetch fail:', err);
  }
};
