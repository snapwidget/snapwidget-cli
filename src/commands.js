// Each command calls one tool of the SnapWidget MCP server. "args" are the tool arguments that
// the command takes by position; every other argument is an option (--per-page 10).
export const COMMANDS = [
  { group: 'Account', name: 'account', tool: 'get_account' },
  { group: 'Account', name: 'upgrade-link', tool: 'get_upgrade_link' },
  { group: 'Account', name: 'invoices', tool: 'list_invoices' },

  { group: 'Social accounts', name: 'accounts list', tool: 'list_accounts' },
  { group: 'Social accounts', name: 'accounts connect', tool: 'connect_account' },
  { group: 'Social accounts', name: 'accounts reconnect', tool: 'reconnect_account', args: ['account_id'] },
  { group: 'Social accounts', name: 'accounts remove', tool: 'remove_account', args: ['account_id'] },

  { group: 'Widgets', name: 'widgets types', tool: 'list_widget_types' },
  { group: 'Widgets', name: 'widgets list', tool: 'list_widgets' },
  { group: 'Widgets', name: 'widgets get', tool: 'get_widget', args: ['widget_id'] },
  { group: 'Widgets', name: 'widgets create', tool: 'create_widget' },
  { group: 'Widgets', name: 'widgets update', tool: 'update_widget', args: ['widget_id'] },
  { group: 'Widgets', name: 'widgets copy', tool: 'copy_widget', args: ['widget_id'] },
  { group: 'Widgets', name: 'widgets delete', tool: 'delete_widget', args: ['widget_id'] },
  { group: 'Widgets', name: 'widgets stats', tool: 'get_widget_stats', args: ['widget_id'] },
  { group: 'Widgets', name: 'embed', tool: 'get_embed_code', args: ['widget_id'] },
  { group: 'Widgets', name: 'posts', tool: 'list_widget_posts', args: ['widget_id'] },
  { group: 'Widgets', name: 'tags set', tool: 'set_product_tags', args: ['widget_id', 'post_id'] },

  { group: 'Reviews', name: 'reviews find-google', tool: 'find_google_business', args: ['query'] },
  { group: 'Reviews', name: 'reviews sources list', tool: 'list_review_sources' },
  { group: 'Reviews', name: 'reviews sources add', tool: 'add_review_source' },
  { group: 'Reviews', name: 'reviews sources get', tool: 'get_review_source', args: ['source_id'] },
  { group: 'Reviews', name: 'reviews sources update', tool: 'update_review_source', args: ['source_id'] },
  { group: 'Reviews', name: 'reviews sources sync', tool: 'sync_review_source', args: ['source_id'] },
  { group: 'Reviews', name: 'reviews sources approve', tool: 'approve_pending_reviews', args: ['source_id'] },
  { group: 'Reviews', name: 'reviews sources import', tool: 'import_reviews', args: ['source_id'] },
  { group: 'Reviews', name: 'reviews sources remove', tool: 'remove_review_source', args: ['source_id'] },
  { group: 'Reviews', name: 'reviews add', tool: 'add_review', args: ['source_id'] },
  { group: 'Reviews', name: 'reviews update', tool: 'update_review', args: ['review_id'] },
  { group: 'Reviews', name: 'reviews delete', tool: 'delete_review', args: ['review_id'] },

  { group: 'Campaigns', name: 'campaigns list', tool: 'list_campaigns' },
  { group: 'Campaigns', name: 'campaigns get', tool: 'get_campaign', args: ['campaign_id'] },
  { group: 'Campaigns', name: 'campaigns save', tool: 'save_campaign' },
  { group: 'Campaigns', name: 'campaigns delete', tool: 'delete_campaign', args: ['campaign_id'] },
  { group: 'Campaigns', name: 'campaigns remove-participant', tool: 'remove_campaign_participant', args: ['campaign_id', 'participant_id'] },
];
