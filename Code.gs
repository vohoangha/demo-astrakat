
const APP_SECRET = "astra_secure_key_2024"; 

const MAIN_AVATAR_FOLDER_ID = "1HtpF48l6xWRmfw-V9grHP4BZOf-wIpeB"; 
const GENERATED_IMAGE_FOLDER_ID = "1RspS460s5al3y9aMpfk_gCRMEh_RfR9N";
const USER_DB_SHEET_ID = "14ZbLmTQBDDvU_TNUxpPw8LQe6rHL0SY22rBboU6d7do";

function setup_permissions() {
  console.log("Checking permissions...");
  
  try {
    const email = Session.getActiveUser().getEmail();
    console.log("Auth User: " + email);
  } catch (e) {
    console.error("Auth: FAIL");
  }

  try {
    const root = DriveApp.getRootFolder();
    console.log("Drive: OK");
  } catch (e) {
    console.error("Drive: FAIL (" + e.toString() + ")");
  }

  try {
    const ss = SpreadsheetApp.openById(USER_DB_SHEET_ID);
    console.log("Sheet: OK (" + ss.getName() + ")");
  } catch (e) {
    console.error("Sheet: FAIL (" + e.toString() + ")");
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
     return createJSONOutput({ error: "Server Busy" });
  }

  try {
    if (!e || !e.postData) return createJSONOutput({ error: "No data received" });
    
    let data;
    try {
        data = JSON.parse(e.postData.contents);
    } catch (jsonErr) {
        return createJSONOutput({ error: "Invalid JSON format" });
    }
    
    if (data.appSecret && data.appSecret !== APP_SECRET) {
       return createJSONOutput({ error: "Unauthorized" });
    }

    switch (data.action) {
      case 'test_connection':
        return createJSONOutput({ success: true, message: "Connected" });
      case 'upload_avatar': 
        return handleUploadAvatar(data);
      case 'delete_avatar': 
        return handleDeleteAvatar(data);
      case 'upload_generated_image': 
        return handleUploadGeneratedImage(data);
      case 'sync_user_data':
        return handleSyncUserData(data);
      default: 
        return createJSONOutput({ error: "Invalid Action" });
    }
  } catch (e) {
    return createJSONOutput({ error: "Script Error: " + e.toString() });
  } finally {
    lock.releaseLock();
  }
}

function handleSyncUserData(data) {
  try {
    const ss = SpreadsheetApp.openById(USER_DB_SHEET_ID);
    const sheet = ss.getSheets()[0];
    
    const targetUser = data.username ? data.username.toString().toLowerCase().trim() : "";
    if (!targetUser) return createJSONOutput({ error: "Missing username" });

    const COL_NO = 1;
    const COL_USER = 2;
    const START_ROW = 2; 

    const lastRow = Math.max(sheet.getLastRow(), 200); 
    const userRange = sheet.getRange(START_ROW, COL_USER, lastRow - START_ROW + 1, 1);
    const userValues = userRange.getValues();
    
    let foundRowIndex = -1; 
    let firstEmptyRowIndex = -1;

    for (let i = 0; i < userValues.length; i++) {
        const cellValue = userValues[i][0] ? userValues[i][0].toString().toLowerCase().trim() : "";
        
        if (cellValue === targetUser) {
            foundRowIndex = i;
            break; 
        }

        if (cellValue === "" && firstEmptyRowIndex === -1) {
            firstEmptyRowIndex = i;
        }
    }

    let targetSheetRow;
    let actionType = "";

    if (foundRowIndex !== -1) {
        targetSheetRow = START_ROW + foundRowIndex;
        actionType = "updated";
    } else {
        if (firstEmptyRowIndex !== -1) {
            targetSheetRow = START_ROW + firstEmptyRowIndex;
        } else {
            targetSheetRow = sheet.getLastRow() + 1;
        }
        
        const currentNo = sheet.getRange(targetSheetRow, COL_NO).getValue();
        if (!currentNo) {
             let prevNo = 0;
             if (targetSheetRow > START_ROW) { 
                 const val = sheet.getRange(targetSheetRow - 1, COL_NO).getValue();
                 prevNo = parseInt(val) || 0; 
             }
             sheet.getRange(targetSheetRow, COL_NO).setValue(prevNo + 1);
        }
        
        sheet.getRange(targetSheetRow, COL_USER).setValue(targetUser);
        actionType = "created";
    }

    if (data.password !== undefined) sheet.getRange(targetSheetRow, 3).setValue(data.password);
    if (data.credits !== undefined) sheet.getRange(targetSheetRow, 4).setValue(data.credits);
    if (data.team !== undefined) sheet.getRange(targetSheetRow, 5).setValue(data.team);
    if (data.role !== undefined) sheet.getRange(targetSheetRow, 6).setValue(data.role);
    if (data.status !== undefined) sheet.getRange(targetSheetRow, 7).setValue(data.status);

    const statusValue = data.status !== undefined ? data.status : sheet.getRange(targetSheetRow, 7).getValue();
    const fullRowRange = sheet.getRange(targetSheetRow, 1, 1, 7);

    if (statusValue === 'deleted user') {
        sheet.getRange(targetSheetRow, 2, 1, 2)
             .setFontLine("line-through")
             .setFontColor("#ff0000"); 

        sheet.getRange(targetSheetRow, 5, 1, 2).clearContent();
        
        sheet.getRange(targetSheetRow, 7).setFontColor("#ff0000").setFontLine("none");

    } else {
        fullRowRange.setFontLine("none");
        fullRowRange.setFontColor("black"); 
    }

    fullRowRange.setVerticalAlignment("middle");
    fullRowRange.setHorizontalAlignment("center");
    fullRowRange.setFontFamily("Arial"); 
    
    sheet.getRange(targetSheetRow, 3).setWrap(true); 

    return createJSONOutput({ success: true, action: actionType, row: targetSheetRow, username: targetUser });

  } catch (error) {
    return createJSONOutput({ error: "Sync Failed: " + error.toString() });
  }
}

function handleUploadAvatar(data) {
  try {
    const mainFolder = DriveApp.getFolderById(MAIN_AVATAR_FOLDER_ID);
    const username = data.username || "unknown_user";
    
    const userFolder = getOrCreateFolder(mainFolder, username);
    userFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const parts = data.base64Image.split(",");
    const mimeType = parts[0].match(/:(.*?);/)[1];
    const base64Data = parts[1];
    
    const fileName = `avatar_${Date.now()}.${mimeType.split('/')[1]}`;
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);

    const file = userFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const publicUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
    
    return createJSONOutput({ success: true, url: publicUrl });
  } catch(e) {
    return createJSONOutput({ error: "Avatar Upload Failed: " + e.toString() });
  }
}

function handleDeleteAvatar(data) {
  try {
    const url = data.fileUrl;
    if (!url || !url.includes("id=")) return createJSONOutput({ success: true });
    
    const id = url.split("id=")[1].split("&")[0];
    const file = DriveApp.getFileById(id);
    file.setTrashed(true);
    
    return createJSONOutput({ success: true });
  } catch(e) {
    return createJSONOutput({ success: true });
  }
}

function handleUploadGeneratedImage(data) {
  try {
    const imageStr = data.image; 
    const filename = data.filename || "image.png";
    const prompt = data.prompt || "";
    const username = data.username || "Anonymous";
    const team = data.team || "Unknown";

    // Robustly extract base64 data regardless of prefix presence or whitespace
    let base64Data = imageStr;
    if (imageStr.includes("base64,")) {
       base64Data = imageStr.split("base64,")[1];
    }
    // Clean potential whitespace newlines
    base64Data = base64Data.replace(/\s/g, "");

    const decodedBlob = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBlob, "image/png", filename);

    const parentFolder = DriveApp.getFolderById(GENERATED_IMAGE_FOLDER_ID);

    const dateString = Utilities.formatDate(new Date(), "GMT+7", "dd-MM-yyyy");
    
    const dateFolder = getOrCreateFolder(parentFolder, dateString);

    const safeUsername = username.replace(/[^a-zA-Z0-9._-]/g, ""); 
    const finalUsername = safeUsername || "Unknown_User";

    const targetFolder = getOrCreateFolder(dateFolder, finalUsername);

    const file = targetFolder.createFile(blob);
    
    const description = "Creator: " + username + " | Team " + team + "\n\nPrompt: " + prompt;
    file.setDescription(description);
    
    return createJSONOutput({ 
      success: true, 
      id: file.getId(),
      url: file.getUrl(),
      path: dateString + "/" + finalUsername
    });

  } catch (error) {
    return createJSONOutput({ error: "Image Upload Failed: " + error.toString() });
  }
}

function getOrCreateFolder(parent, name) {
  const folders = parent.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(name);
  }
}

function createJSONOutput(obj) { 
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); 
}
