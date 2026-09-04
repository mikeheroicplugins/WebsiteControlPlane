const operationRows = String.raw`
Account|GET|/account/apiSettings|getApiSettings|Get API spend settings
Account|GET|/account/balance|getBalance|Get account balance
Account|POST|/account/invite|createAccountInvite|Create an account registration invite
Account|GET|/account/inviteStatus|getAccountInviteStatus|Check account invite status
Cloudflare|POST|/cloudflare/connect|cloudflareConnect|Queue domains to move to Cloudflare
Cloudflare|POST|/cloudflare/createRecord/{domain}|cloudflareCreateRecord|Create a Cloudflare DNS record
Cloudflare|POST|/cloudflare/deleteRecord/{domain}/{recordId}|cloudflareDeleteRecord|Delete a Cloudflare DNS record
Cloudflare|POST|/cloudflare/disconnect|cloudflareDisconnect|Disconnect Cloudflare
Cloudflare|POST|/cloudflare/editRecord/{domain}/{recordId}|cloudflareEditRecord|Edit a Cloudflare DNS record
Cloudflare|GET|/cloudflare/get/{domain}|cloudflareGet|Get a domain move status
Cloudflare|GET|/cloudflare/getConnection|cloudflareGetConnection|Get Cloudflare connection
Cloudflare|GET|/cloudflare/getQueue|cloudflareGetQueue|List Cloudflare move queue
Cloudflare|GET|/cloudflare/getRecords/{domain}|cloudflareGetRecords|List Cloudflare DNS records
Cloudflare|GET|/cloudflare/getZone/{domain}|cloudflareGetZone|Get Cloudflare zone state
Cloudflare|GET|/cloudflare/getZoneSettings/{domain}|cloudflareGetZoneSettings|Get Cloudflare zone settings
Cloudflare|GET|/cloudflare/inventory|cloudflareInventory|List Cloudflare eligibility
Cloudflare|GET|/cloudflare/preview/{domain}|cloudflarePreview|Preview a Cloudflare move
Cloudflare|POST|/cloudflare/retry/{domain}|cloudflareRetry|Retry a Cloudflare move
Cloudflare|POST|/cloudflare/rollback/{domain}|cloudflareRollback|Roll back a Cloudflare move
Cloudflare|POST|/cloudflare/setProxy/{domain}|cloudflareSetProxy|Set Cloudflare proxy state
Cloudflare|POST|/cloudflare/setZoneSettings/{domain}|cloudflareSetZoneSettings|Set Cloudflare zone settings
Domain|POST|/domain/addUrlForward/{domain}|domainAddUrlForward|Add URL forwarding
Domain|POST|/domain/checkDomain/{domain}|domainCheckDomain|Check domain availability and pricing
Domain|POST|/domain/create/{domain}|domainCreate|Register a domain
Domain|POST|/domain/createGlue/{domain}/{subdomain}|domainCreateGlue|Create a glue record
Domain|POST|/domain/deleteGlue/{domain}/{subdomain}|domainDeleteGlue|Delete a glue record
Domain|POST|/domain/deleteUrlForward/{domain}/{id}|domainDeleteUrlForward|Delete URL forwarding
Domain|GET|/domain/get/{domain}|getDomain|Get domain details
Domain|GET|/domain/getContacts/{domain}|domainGetContacts|Get domain contacts
Domain|GET|/domain/getGlue/{domain}|getDomainGlue|Get glue records
Domain|GET|/domain/getNs/{domain}|getDomainNs|Get nameservers
Domain|GET|/domain/getRegistrationRequirements/{tld}|domainGetRegistrationRequirements|Get TLD registration requirements
Domain|GET|/domain/getTransfer/{domain}|getTransferGet|Get transfer status
Domain|GET|/domain/getUrlForwarding/{domain}|getDomainUrlForwarding|List URL forwards
Domain|GET|/domain/listAll|getDomains|List registered domains
Domain|GET|/domain/listTransfers|listTransfersGet|List active transfers
Domain|POST|/domain/renew/{domain}|domainRenew|Renew a domain
Domain|POST|/domain/transfer/{domain}|transferDomain|Transfer a domain
Domain|POST|/domain/updateAutoRenew/{domain}|domainUpdateAutoRenew|Update automatic renewal
Domain|POST|/domain/updateContacts/{domain}|domainUpdateContacts|Update domain contacts
Domain|POST|/domain/updateGlue/{domain}/{subdomain}|domainUpdateGlue|Update a glue record
Domain|POST|/domain/updateNs/{domain}|domainUpdateNs|Update nameservers
DNS|POST|/dns/create/{domain}|dnsCreate|Create a DNS record
DNS|POST|/dns/createDnssecRecord/{domain}|dnsCreateDnssecRecord|Create a DNSSEC record
DNS|POST|/dns/delete/{domain}/{id}|dnsDelete|Delete a DNS record by ID
DNS|POST|/dns/deleteByNameType/{domain}/{type}/{subdomain}|dnsDeleteByNameType|Delete DNS records by name and type
DNS|POST|/dns/deleteDnssecRecord/{domain}/{keytag}|dnsDeleteDnssecRecord|Delete a DNSSEC record
DNS|POST|/dns/edit/{domain}/{id}|dnsEdit|Edit a DNS record by ID
DNS|POST|/dns/editByNameType/{domain}/{type}/{subdomain}|dnsEditByNameType|Edit DNS records by name and type
DNS|GET|/dns/getDnssecRecords/{domain}|getDnssecRecords|List DNSSEC records
DNS|GET|/dns/retrieve/{domain}|getDnsRecords|List DNS records
DNS|GET|/dns/retrieve/{domain}/{id}|getDnsRecordById|Get a DNS record by ID
DNS|GET|/dns/retrieveByNameType/{domain}/{type}/{subdomain}|getDnsRecordsByNameType|Get DNS records by name and type
Email|POST|/email/setPassword|emailSetPassword|Set email hosting password
Hosting|POST|/hosting/create/{domain}|hostingCreate|Provision hosting
Hosting|POST|/hosting/createWpCredentials/{domain}|hostingCreateWpCredentials|Create WordPress API credentials
Hosting|POST|/hosting/delete/{domain}|hostingDelete|Deprovision hosting
Hosting|POST|/hosting/deleteFile/{domain}|hostingDeleteFile|Delete a hosted file
Hosting|POST|/hosting/deleteWpCredentials/{domain}|hostingDeleteWpCredentials|Revoke WordPress API credentials
Hosting|POST|/hosting/deploy/{domain}|hostingDeploy|Deploy hosted files
Hosting|GET|/hosting/files/{domain}|hostingFiles|List hosted files
Hosting|GET|/hosting/get/{domain}|hostingGet|Get hosting status
Hosting|GET|/hosting/getWpCredentials/{domain}|hostingGetWpCredentials|List WordPress API credentials
Hosting|POST|/hosting/makeDir/{domain}|hostingMakeDir|Create a hosted directory
Hosting|GET|/hosting/plans|hostingPlans|List hosting plans
Marketplace|GET|/marketplace/getAll|listMarketplaceListingsGet|List marketplace domains
Pricing|GET|/pricing/get|getPricingGet|Get domain pricing
Sandbox|POST|/sandbox/reset|sandboxReset|Reset the sandbox account
Sandbox|POST|/sandbox/topup|sandboxTopup|Add sandbox credit
Sandbox|POST|/sandbox/triggerWebhook|sandboxTriggerWebhook|Trigger a sandbox webhook
SSL|GET|/ssl/retrieve/{domain}|getSslRetrieve|Retrieve an SSL bundle
Utility|GET|/ip|getIp|Get caller IP address
Utility|GET|/ping|pingGet|Test credentials
Webhooks|POST|/webhook/create|webhookCreate|Create a webhook
Webhooks|POST|/webhook/delete|webhookDelete|Delete a webhook
Webhooks|GET|/webhook/deliveries|webhookDeliveries|List webhook deliveries
Webhooks|GET|/webhook/delivery/{id}|webhookDelivery|Get a webhook delivery
Webhooks|GET|/webhook/eventTypes|webhookEventTypes|List webhook event types
Webhooks|GET|/webhook/get/{id}|webhookGet|Get a webhook
Webhooks|GET|/webhook/list|webhookList|List webhooks
Webhooks|POST|/webhook/resend|webhookResend|Resend a webhook delivery
Webhooks|POST|/webhook/rotateSecret|webhookRotateSecret|Rotate a webhook signing secret
Webhooks|POST|/webhook/test|webhookTest|Send a webhook test event
Webhooks|POST|/webhook/update|webhookUpdate|Update a webhook
`.trim();

const safePostOperations = new Set(['domainCheckDomain']);
const billableOperations = new Set(['domainCreate', 'domainRenew', 'transferDomain', 'hostingCreate']);
const destructiveOperations = new Set([
  'cloudflareDeleteRecord', 'cloudflareDisconnect', 'cloudflareRollback', 'domainDeleteGlue',
  'domainDeleteUrlForward', 'dnsDelete', 'dnsDeleteByNameType', 'dnsDeleteDnssecRecord',
  'hostingDelete', 'hostingDeleteFile', 'hostingDeleteWpCredentials', 'sandboxReset',
  'webhookDelete', 'webhookRotateSecret',
]);

export const porkbunOperations = operationRows.split('\n').map((row) => {
  const [group, method, path, id, summary] = row.split('|');
  const mutating = method === 'POST' && !safePostOperations.has(id);
  return Object.freeze({
    id,
    group,
    method,
    path,
    summary,
    pathParameters: [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]),
    billable: billableOperations.has(id),
    destructive: destructiveOperations.has(id),
    requiresConfirmation: mutating,
    supportsDryRun: ['domainCreate', 'domainRenew', 'transferDomain', 'dnsCreate'].includes(id),
  });
});

export const porkbunOperationsById = new Map(porkbunOperations.map((operation) => [operation.id, operation]));
