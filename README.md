# @zyx1121/apple-contacts-mcp

MCP server for Apple Contacts — create, search, update, and manage contacts via Claude Code.

## Install

```bash
claude mcp add apple-contacts -- npx @zyx1121/apple-contacts-mcp
```

## Prerequisites

- macOS with Contacts.app configured
- Node.js >= 18
- First run will prompt for Automation permission (System Settings > Privacy & Security > Automation)

## Tools

| Tool | Description |
|------|-------------|
| `contacts_list` | List all contacts |
| `contacts_search` | Search contacts by name, phone, or email |
| `contacts_get` | Get full details of a contact by ID |
| `contacts_create` | Create a new contact |
| `contacts_update` | Update a contact (name, company, phones, emails, addresses) |
| `contacts_delete` | Delete a contact |

### Update fields

`contacts_update` supports the following array fields — when provided, all existing entries of that type are replaced:

- **phones**: `[{ "label": "mobile", "value": "0912345678" }]`
- **emails**: `[{ "label": "work", "value": "user@example.com" }]`
- **addresses**: `[{ "label": "home", "street": "...", "city": "...", "state": "...", "zip": "...", "country": "..." }]`

## Examples

```
"List all contacts"              → contacts_list
"Find John"                      → contacts_search { query: "John" }
"Get contact details"            → contacts_get { id: "ABC-123" }
"Create a contact"               → contacts_create { first_name: "John", last_name: "Doe" }
"Update phone number"            → contacts_update { id: "ABC-123", phones: [{ "label": "mobile", "value": "0912345678" }] }
"Delete contact"                 → contacts_delete { id: "ABC-123" }
```

## Limitations

- macOS only (uses AppleScript via `osascript`)
- Contacts.app must be running
- Contact IDs may change after iCloud sync

## License

MIT
