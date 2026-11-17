# Isaano RCA privacy policy

Last updated: 17 November 2026

Isaano RCA is a Forge app for Jira. It runs entirely on Atlassian's Forge platform ("Runs on Atlassian"): it has no servers of its own and makes no calls outside Atlassian.

## What the app reads

When someone opens the Isaano RCA panel on an issue, or asks the Isaano RCA Investigator agent or an MCP client about an incident, the app reads that issue through the Jira REST API, as that user and with that user's permissions: the summary, status, priority, created and resolution dates, the change history and the comments. It uses them to build the timeline and the response and restore times on the fly. It does not copy them into storage.

## What the app stores

For each issue where people use it, the app stores what they enter in the panel or through the agent: the evidence register (type, network segment, source, time, what the evidence shows, whether it shows a deviation), the findings and the corrective actions. This is kept in the app's Forge storage on the Jira site where the app is installed, keyed by the issue ID.

The app does not store Atlassian account IDs or any other user reference. Users should not put personal data (names, phone numbers, subscriber identifiers) into evidence text; mask it as they would in any incident record.

## What the app writes

When a user selects **Publish RCA to the ticket**, the app posts the RCA report to that issue as an internal comment. Nothing else is written to Jira.

## Sharing and retention

The app does not send data to anyone outside Atlassian, and it does not sell, share or analyse data for any other purpose. Removing an item in the panel deletes it from storage. Storage of an uninstalled app is handled by Atlassian under the Forge platform's data lifecycle.

## Contact

Questions and requests: https://github.com/fkamanzi/isaano-rca/issues
