import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runAppleScript, escapeForAppleScript } from "../applescript.js";
import { success, error, withErrorHandling } from "../helpers.js";

const RS = "\u001e"; // ASCII 30 Record Separator

function parseContact(line: string) {
  const [id, name, firstName, lastName, org, phones, emails] = line.split("\t");
  return {
    id,
    name,
    firstName: firstName || null,
    lastName: lastName || null,
    organization: org || null,
    phones: phones ? phones.split(",").filter(Boolean).map((p) => {
      const [label, ...rest] = p.split(":");
      return { label, value: rest.join(":") };
    }) : [],
    emails: emails ? emails.split(",").filter(Boolean).map((e) => {
      const [label, ...rest] = e.split(":");
      return { label, value: rest.join(":") };
    }) : [],
  };
}

function parseContacts(raw: string) {
  if (!raw) return [];
  return raw.split(RS).filter(Boolean).map(parseContact);
}

const CONTACT_FIELDS = `
    set phoneList to ""
    repeat with ph in phones of p
      set phoneList to phoneList & (label of ph) & ":" & (value of ph) & ","
    end repeat
    set emailList to ""
    repeat with em in emails of p
      set emailList to emailList & (label of em) & ":" & (value of em) & ","
    end repeat
    set fn to ""
    try
      if first name of p is not missing value then set fn to first name of p
    end try
    set ln to ""
    try
      if last name of p is not missing value then set ln to last name of p
    end try
    set org to ""
    try
      if organization of p is not missing value then set org to organization of p
    end try`;

export function registerContactTools(server: McpServer) {
  // List all contacts
  server.registerTool(
    "contacts_list",
    {
      description: "List all contacts",
      inputSchema: z.object({
        limit: z.coerce.number().default(50).describe("Max contacts to return (default 50)"),
      }),
    },
    withErrorHandling(async ({ limit }) => {
      const raw = await runAppleScript(`
tell application "Contacts"
  set output to ""
  set cnt to 0
  repeat with p in every person
    if cnt >= ${limit} then exit repeat
    ${CONTACT_FIELDS}
    set output to output & (id of p) & "\\t" & (name of p) & "\\t" & fn & "\\t" & ln & "\\t" & org & "\\t" & phoneList & "\\t" & emailList & (ASCII character 30)
    set cnt to cnt + 1
  end repeat
  return output
end tell`);
      return success(parseContacts(raw));
    }),
  );

  // Search contacts
  server.registerTool(
    "contacts_search",
    {
      description: "Search contacts by name, phone, or email",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search keyword"),
      }),
    },
    withErrorHandling(async ({ query }) => {
      const esc = escapeForAppleScript(query);
      const raw = await runAppleScript(`
tell application "Contacts"
  set output to ""
  set seen to {}
  repeat with p in every person
    set pid to id of p
    if pid is not in seen then
      set matched to false
      if name of p contains "${esc}" then set matched to true
      if not matched then
        repeat with ph in phones of p
          if value of ph contains "${esc}" then
            set matched to true
            exit repeat
          end if
        end repeat
      end if
      if not matched then
        repeat with em in emails of p
          if value of em contains "${esc}" then
            set matched to true
            exit repeat
          end if
        end repeat
      end if
      if matched then
        set end of seen to pid
        ${CONTACT_FIELDS}
        set output to output & pid & "\\t" & (name of p) & "\\t" & fn & "\\t" & ln & "\\t" & org & "\\t" & phoneList & "\\t" & emailList & (ASCII character 30)
      end if
    end if
  end repeat
  return output
end tell`);
      return success(parseContacts(raw));
    }),
  );

  // Get contact by ID
  server.registerTool(
    "contacts_get",
    {
      description: "Get full details of a contact by ID",
      inputSchema: z.object({
        id: z.string().describe("Contact ID"),
      }),
    },
    withErrorHandling(async ({ id }) => {
      const esc = escapeForAppleScript(id);
      const raw = await runAppleScript(`
tell application "Contacts"
  set p to person id "${esc}"
  ${CONTACT_FIELDS}
  set addrList to ""
  repeat with a in addresses of p
    set addrList to addrList & (label of a) & ":" & (street of a) & ";"
  end repeat
  set urlList to ""
  repeat with u in urls of p
    set urlList to urlList & (label of u) & ":" & (value of u) & ","
  end repeat
  set bd to ""
  try
    if birth date of p is not missing value then set bd to (birth date of p as string)
  end try
  return (id of p) & "\\t" & (name of p) & "\\t" & fn & "\\t" & ln & "\\t" & org & "\\t" & phoneList & "\\t" & emailList & "\\t" & addrList & "\\t" & urlList & "\\t" & bd
end tell`);
      if (!raw) return error("Contact not found");
      const parts = raw.split("\t");
      const [cid, name, firstName, lastName, organization, phones, emails, addresses, urls, birthDate] = parts;
      return success({
        id: cid,
        name,
        firstName: firstName || null,
        lastName: lastName || null,
        organization: organization || null,
        phones: phones ? phones.split(",").filter(Boolean).map((p) => {
          const [label, ...rest] = p.split(":");
          return { label, value: rest.join(":") };
        }) : [],
        emails: emails ? emails.split(",").filter(Boolean).map((e) => {
          const [label, ...rest] = e.split(":");
          return { label, value: rest.join(":") };
        }) : [],
        addresses: addresses ? addresses.split(";").filter(Boolean).map((a) => {
          const [label, ...rest] = a.split(":");
          return { label, street: rest.join(":") };
        }) : [],
        urls: urls ? urls.split(",").filter(Boolean).map((u) => {
          const [label, ...rest] = u.split(":");
          return { label, value: rest.join(":") };
        }) : [],
        birthDate: birthDate || null,
      });
    }),
  );

  // Create contact
  server.registerTool(
    "contacts_create",
    {
      description: "Create a new contact",
      inputSchema: z.object({
        first_name: z.string().optional().describe("First name"),
        last_name: z.string().optional().describe("Last name"),
        organization: z.string().optional().describe("Company/organization"),
        phone: z.string().optional().describe("Phone number"),
        phone_label: z.string().default("mobile").describe("Phone label (mobile, home, work, etc.)"),
        email: z.string().optional().describe("Email address"),
        email_label: z.string().default("work").describe("Email label (work, home, etc.)"),
      }),
    },
    withErrorHandling(async ({ first_name, last_name, organization, phone, phone_label, email, email_label }) => {
      if (!first_name && !last_name && !organization) return error("Provide at least first_name, last_name, or organization");
      const props: string[] = [];
      if (first_name) props.push(`first name:"${escapeForAppleScript(first_name)}"`);
      if (last_name) props.push(`last name:"${escapeForAppleScript(last_name)}"`);
      if (organization) props.push(`organization:"${escapeForAppleScript(organization)}"`);
      const phoneCmd = phone
        ? `make new phone at end of phones of newPerson with properties {label:"${escapeForAppleScript(phone_label)}", value:"${escapeForAppleScript(phone)}"}`
        : "";
      const emailCmd = email
        ? `make new email at end of emails of newPerson with properties {label:"${escapeForAppleScript(email_label)}", value:"${escapeForAppleScript(email)}"}`
        : "";
      const raw = await runAppleScript(`
tell application "Contacts"
  set newPerson to make new person with properties {${props.join(", ")}}
  ${phoneCmd}
  ${emailCmd}
  save
  return (id of newPerson) & "\\t" & (name of newPerson)
end tell`);
      const [id, name] = raw.split("\t");
      return success({ id, name, created: true });
    }),
  );

  // Update contact
  server.registerTool(
    "contacts_update",
    {
      description: "Update an existing contact",
      inputSchema: z.object({
        id: z.string().describe("Contact ID"),
        first_name: z.string().optional().describe("New first name"),
        last_name: z.string().optional().describe("New last name"),
        organization: z.string().optional().describe("New organization"),
      }),
    },
    withErrorHandling(async ({ id, first_name, last_name, organization }) => {
      const esc = escapeForAppleScript(id);
      const updates: string[] = [];
      if (first_name !== undefined) updates.push(`set first name of p to "${escapeForAppleScript(first_name)}"`);
      if (last_name !== undefined) updates.push(`set last name of p to "${escapeForAppleScript(last_name)}"`);
      if (organization !== undefined) updates.push(`set organization of p to "${escapeForAppleScript(organization)}"`);
      if (!updates.length) return error("No fields to update");
      await runAppleScript(`
tell application "Contacts"
  set p to person id "${esc}"
  ${updates.join("\n  ")}
  save
end tell`);
      return success({ id, updated: true });
    }),
  );

  // Delete contact
  server.registerTool(
    "contacts_delete",
    {
      description: "Delete a contact",
      inputSchema: z.object({
        id: z.string().describe("Contact ID"),
      }),
    },
    withErrorHandling(async ({ id }) => {
      const esc = escapeForAppleScript(id);
      await runAppleScript(`
tell application "Contacts"
  set p to person id "${esc}"
  delete p
  save
end tell`);
      return success({ id, deleted: true });
    }),
  );
}
