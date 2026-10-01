# Google Sheets — authoritative LR gateway

The extension no longer treats the local Owlbear LR balance as the source of truth when the Apps Script gateway is configured.

## 1. Apps Script

Create a standalone Apps Script project and paste Code.gs from this directory.

In Project settings → Script properties add:

- LETOPIS_SHEET_ID = the spreadsheet ID
- LETOPIS_API_TOKEN = a long random secret

The script uses the existing sheets:

- ГОСУДАРСТВА [1910] — source of population, conscription law and current LR.
- backend — maps stable country keys to rows of the state sheet.
- ЛР_ОПЕРАЦИИ — transaction journal.

The current LR is column AO of the state's main row. On the first transaction for a state, an existing AO formula is replaced by a numeric current balance. This is intentional: AO becomes the authoritative mutable LR balance.

Amounts in the API are thousands of people. Thus 5 means 5,000 people.

## 2. Deploy

Deploy the project as a Web app:

- Execute as: Me / deploying user
- Who has access: Anyone (the API itself is protected by LETOPIS_API_TOKEN)

Apps Script web apps support doPost(e) and can be deployed from the Deploy menu. Keep the /exec URL private enough to avoid unnecessary exposure; the token is the actual API credential.

## 3. Configure Owlbear

In the extension settings enter:

- Apps Script API людского ресурса — the deployed /exec URL.
- Токен Apps Script API — exactly the same token as LETOPIS_API_TOKEN.

The extension then:

1. Reads the sheet snapshot before a healing/turn operation.
2. Runs the existing game mechanics against that snapshot.
3. Sends the exact LR delta to spendLRBatch.
4. Receives the authoritative balances back and marks the local LR transaction RECORDED.
5. If Owlbear persistence fails, calls refundLRBatch to compensate the sheet transaction.
6. Scheduled turn completion uses the same path for automatic formation/completion costs.

The gateway uses a script lock so concurrent LR operations cannot spend the same balance simultaneously.

## 4. Important migration note

Do not manually edit AO for a state while an LR transaction is in progress. For administrative corrections use the existing GM correction UI or deliberately change the sheet balance; the next Owlbear snapshot will use the sheet value as authoritative.
