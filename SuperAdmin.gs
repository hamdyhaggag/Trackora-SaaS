// ============================================================
// تراكورا SaaS — SuperAdmin.gs
// خاص بصلاحيات لوحة التحكم المركزية للمدير العام فقط
// ============================================================

const SA_CONFIG = {
  // Spreadsheet ID الخاص بمدير النظام والذي يحتوي على حسابات وأرقام كل العملاء (Master Data)
  MASTER_SPREADSHEET_ID: '1SXE1K3qhDoxh0FQCLpWSB3jieaSJtFlQmMIerKRmwls',
  SHEETS: {
    CLIENTS: '👥 Clients'
  }
};

// قراءة باسورد المدير العام من الإعدادات أو استخدام افتراضي للتجربة
const SUPER_ADMIN_PASSWORD = PropertiesService.getScriptProperties().getProperty('SUPER_ADMIN_PASSWORD') || '';

// ============================================================
// دوال إدارة العملاء (SaaS Controller)
// ============================================================

function sa_login(password) {
  return { success: password === SUPER_ADMIN_PASSWORD };
}

function sa_getAllClients() {
  try {
    var ss = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    var clients = [];
    
    // Header row is index 0
    for (var i = 1; i < data.length; i++) {
      clients.push({
        clientId: data[i][0],
        username: data[i][1],
        password: data[i][2],
        companyName: data[i][3],
        spreadsheetId: data[i][4],
        status: data[i][5],
        expiryDate: data[i][6],
        createdAt: data[i][7],
        notes: data[i][8],
        appBrandName: data[i][9] !== undefined ? data[i][9] : '',
        appLogoUrl: data[i][10] !== undefined ? data[i][10] : ''
      });
    }
    return clients;
  } catch (err) {
    console.error("sa_getAllClientsError: " + err.toString());
    return [];
  }
}

function sa_addClient(clientData) {
  try {
    var masterSS = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
    var sheet = masterSS.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
    if (!sheet) {
      sheet = masterSS.insertSheet(SA_CONFIG.SHEETS.CLIENTS);
      sheet.appendRow(['ClientID', 'Username', 'Password', 'CompanyName', 'SpreadsheetID', 'Status', 'ExpiryDate', 'CreatedAt', 'Notes', 'AppBrandName', 'AppLogoURL', 'Phone1Name', 'Phone1', 'Phone2Name', 'Phone2', 'WhatsAppGroup', 'GuaranteeLink', 'InstapayNumber', 'CashNumber']);
    }

    // التحقق من عدم تكرار اليوزر نيم
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] === clientData.username) {
        return { success: false, message: 'اسم المستخدم مسجل لعميل آخر' };
      }
    }

    // ✅ إنشاء Google Sheet جديد خاص بالكلايند تلقائياً
    var companyName = clientData.companyName || clientData.username || 'Client';
    var clientSS = SpreadsheetApp.create('تراكورا — ' + companyName);

    // ✅ تهيئة الشيتات المطلوبة تلقائياً داخل الـ Spreadsheet الجديد
    initClientSpreadsheet(clientSS);
    
    // نقل الشيت لمجلد مخصص لو تواجد DRIVE_FOLDER_ID
    var folderId = SA_CONFIG.DRIVE_FOLDER_ID || '';
    if (folderId) {
      var file = DriveApp.getFileById(clientSS.getId());
      var folder = DriveApp.getFolderById(folderId);
      folder.addFile(file);
      // إزالة من المسار الافتراضي (My Drive)
      DriveApp.getRootFolder().removeFile(file);
    }

    var newId = 'CL-' + Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyMMddHHmmss');
    var autoSheetId = clientSS.getId();

    // Upload Logo if provided as base64
    if (clientData.appLogoBase64) {
      var savedLogoUrl = saveBase64File(clientData.appLogoBase64, newId + "_Logo");
      if (savedLogoUrl) {
        clientData.appLogoUrl = savedLogoUrl;
      }
    }

    sheet.appendRow([
      newId,
      clientData.username || '',
      clientData.password || '',
      companyName,
      autoSheetId,
      clientData.status || 'فترة تجريبية',
      clientData.expiryDate || '',
      Utilities.formatDate(new Date(), 'Africa/Cairo', 'dd/MM/yyyy HH:mm:ss'),
      clientData.notes || '',
      clientData.appBrandName || '',
      clientData.appLogoUrl || '',
      clientData.phone1Name || '',
      clientData.phone1 || '',
      clientData.phone2Name || '',
      clientData.phone2 || '',
      clientData.whatsappGroup || '',
      clientData.guaranteeLink || '',
      clientData.instapayNumber || '',
      clientData.cashNumber || ''
    ]);

    return { success: true, clientId: newId, spreadsheetId: autoSheetId, url: clientSS.getUrl() };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// حذف الكلايند من الماستر وحذف الشيت الخاص به من جوجل درايف تلقائياً
function sa_deleteClient(clientId) {
  try {
    var masterSS = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
    var sheet = masterSS.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
    var findResult = sheet.getRange('A:A').createTextFinder(String(clientId).trim()).matchEntireCell(true).findNext();

    if (!findResult) return { success: false, message: 'العميل غير موجود' };

    var rowIndex = findResult.getRow();
    var spreadsheetId = sheet.getRange(rowIndex, 5).getValue(); // عمود SpreadsheetID

    // حذف سطر الكلايند من الماستر أولاً
    sheet.deleteRow(rowIndex);

    // حذف الشيت الخاص به من Drive إذا توجد
    if (spreadsheetId && spreadsheetId.toString().trim() !== '') {
      try {
        var file = DriveApp.getFileById(spreadsheetId);
        file.setTrashed(true); // نقل للسلة (آمن وكريم بدل من حذف كامل)
      } catch (driveErr) {
        // لو ما لقيناش الشيت في الدرايف بسبب صلاحيات ؟ نكمل بدون خطأ
        console.warn('تعذّر حذف الشيت: ' + driveErr.toString());
      }
    }

    return { success: true, message: 'تم حذف الكلايند وشيته بنجاح' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function sa_updateClient(clientData) {
  try {
    var ss = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
    var findResult = sheet.getRange("A:A").createTextFinder(String(clientData.clientId).trim()).matchEntireCell(true).findNext();
    
    if (!findResult) return { success: false, message: 'العميل غير موجود' };
    
    var rowIndex = findResult.getRow();
    
    // Upload Logo if provided as base64
    if (clientData.appLogoBase64) {
      var savedLogoUrl = saveBase64File(clientData.appLogoBase64, clientData.clientId + "_Logo");
      if (savedLogoUrl) {
        clientData.appLogoUrl = savedLogoUrl;
      }
    }

    // التحديث (تجاهل العمود A لأنه ID، وعمود H لأنه تاريخ الانشاء)
    if (clientData.username) sheet.getRange(rowIndex, 2).setValue(clientData.username);
    if (clientData.password) sheet.getRange(rowIndex, 3).setValue(clientData.password);
    if (clientData.companyName) sheet.getRange(rowIndex, 4).setValue(clientData.companyName);
    if (clientData.spreadsheetId) sheet.getRange(rowIndex, 5).setValue(clientData.spreadsheetId);
    if (clientData.status) sheet.getRange(rowIndex, 6).setValue(clientData.status);
    if (clientData.expiryDate !== undefined) sheet.getRange(rowIndex, 7).setValue(clientData.expiryDate);
    if (clientData.notes !== undefined) sheet.getRange(rowIndex, 9).setValue(clientData.notes);
    if (clientData.appBrandName !== undefined) sheet.getRange(rowIndex, 10).setValue(clientData.appBrandName);
    if (clientData.appLogoUrl !== undefined) sheet.getRange(rowIndex, 11).setValue(clientData.appLogoUrl);
    if (clientData.phone1Name !== undefined) sheet.getRange(rowIndex, 12).setValue(clientData.phone1Name);
    if (clientData.phone1 !== undefined) sheet.getRange(rowIndex, 13).setValue(clientData.phone1);
    if (clientData.phone2Name !== undefined) sheet.getRange(rowIndex, 14).setValue(clientData.phone2Name);
    if (clientData.phone2 !== undefined) sheet.getRange(rowIndex, 15).setValue(clientData.phone2);
    if (clientData.whatsappGroup !== undefined) sheet.getRange(rowIndex, 16).setValue(clientData.whatsappGroup);
    if (clientData.guaranteeLink !== undefined) sheet.getRange(rowIndex, 17).setValue(clientData.guaranteeLink);
    if (clientData.instapayNumber !== undefined) sheet.getRange(rowIndex, 18).setValue(clientData.instapayNumber);
    if (clientData.cashNumber !== undefined) sheet.getRange(rowIndex, 19).setValue(clientData.cashNumber);
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function sa_toggleClientStatus(clientId) {
  try {
    var ss = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
    var findResult = sheet.getRange("A:A").createTextFinder(String(clientId).trim()).matchEntireCell(true).findNext();
    
    if (!findResult) return { success: false, message: 'العميل غير موجود' };
    
    var rowIndex = findResult.getRow();
    var currentStatus = sheet.getRange(rowIndex, 6).getValue();
    
    var newStatus = (currentStatus === 'موقوف') ? 'مفعل' : 'موقوف';
    sheet.getRange(rowIndex, 6).setValue(newStatus);
    
    return { success: true, newStatus: newStatus };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// دالة لمعرفة الـ Spreadsheet ID الخاص بعميل معين بناء على حساب الدخول (تستخدم بواسطة Client.gs)
function sa_authenticateClient(username, password) {
  try {
    // كحل مؤقت إذا لم يتم إعداد الماستر بعد، نسمح بدخول السكربت القديم
    if (SA_CONFIG.MASTER_SPREADSHEET_ID === 'YOUR_MASTER_SPREADSHEET_ID_HERE' || SA_CONFIG.MASTER_SPREADSHEET_ID === '') {
      return { 
        success: true, 
        message: 'Master DB not configured yet, using default.',
        spreadsheetId: '1DpbiARHR46jbawxMcC9Dz9VRdMnS6A5NSppcKhblPaE', // الافتراضي للتجربة
        companyName: 'Default Client' 
      };
    }

    var ss = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
    if (!sheet) return { success: false, message: 'لم يتم العثور على قاعدة البيانات المركزية' };
    
    var data = sheet.getDataRange().getValues();
    
    for (var i = 1; i < data.length; i++) {
        var rowUser = data[i][1];
        var rowPass = data[i][2];
        
        if (String(rowUser).trim() === String(username).trim() && String(rowPass).trim() === String(password).trim()) {
            var status = data[i][5];
            var expiry = data[i][6];
            
            if (status === 'موقوف') {
                return { success: false, message: 'تم إيقاف هذا الحساب. يرجى مراجعة إدارة النظام.' };
            }
            
            // تحقق من الانتهاء
            if (expiry) {
                var expiryDateParts = String(expiry).split('-'); // expected format YYYY-MM-DD
                if (expiryDateParts.length === 3) {
                    var expDate = new Date(expiryDateParts[0], expiryDateParts[1] - 1, expiryDateParts[2]);
                    if (new Date() > expDate) {
                        sheet.getRange(i + 1, 6).setValue('منتهي الصلاحية'); // تحديث الحالة
                        return { success: false, message: 'انتهت فترة الاشتراك / الفترة التجريبية.' };
                    }
                }
            }
            
            return {
                success: true,
                clientId: data[i][0],
                companyName: data[i][3],
                spreadsheetId: data[i][4],
                appBrandName: data[i][9] || '',
                appLogoUrl: data[i][10] || '',
                phone1Name: data[i][11] || '',
                phone1: data[i][12] || '',
                phone2Name: data[i][13] || '',
                phone2: data[i][14] || '',
                whatsappGroup: data[i][15] || '',
                guaranteeLink: data[i][16] || '',
                instapayNumber: data[i][17] || '',
                cashNumber: data[i][18] || ''
            };
        }
    }
    
    return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
  } catch (err) {
    return { success: false, error: 'حدث خطأ أثناء الاتصال بقاعدة البيانات المركزية' };
  }
}

// دالة لجلب إعدادات واجهة المتجر (index.html) للعميل بناءً على الـ Client ID
function getStoreConfig(clientId) {
    try {
        var ss = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
        var sheet = ss.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
        var findResult = sheet.getRange("A:A").createTextFinder(String(clientId).trim()).matchEntireCell(true).findNext();
        if (!findResult) return { success: false, message: 'المتجر غير موجود' };
        
        var rowIndex = findResult.getRow();
        var status = sheet.getRange(rowIndex, 6).getValue();
        if (status === 'موقوف' || status === 'منتهي الصلاحية') return { success: false, message: 'المتجر متوقف حالياً' };
        
        var row = sheet.getRange(rowIndex, 1, 1, 19).getValues()[0];
        return {
            success: true,
            spreadsheetId: row[4],
            appBrandName: row[9] || '',
            appLogoUrl: row[10] || 'default.png',
            phone1Name: row[11] || '',
            phone1: row[12] || '',
            phone2Name: row[13] || '',
            phone2: row[14] || '',
            whatsappGroup: row[15] || '',
            guaranteeLink: row[16] || '',
            instapayNumber: row[17] || '',
            cashNumber: row[18] || ''
        };
    } catch(err) {
        return { success: false, error: err.toString() };
    }
}

// ============================================================
// ✅ تهيئة Spreadsheet كلايند جديد بالشيتات والرؤوس الأساسية
// يُستدعى تلقائياً عند إضافة كلايند جديد
// ============================================================
function initClientSpreadsheet(ss) {
  try {
    // --- شيت الطلبات ---
    var ordersSheet = ss.getSheetByName('📋 Orders') || ss.insertSheet('📋 Orders');
    if (ordersSheet.getLastRow() === 0) {
      // سطر 1 بيانات النظام (شرح)
      ordersSheet.getRange(1, 1, 1, 15).setValues([[
        'رقم الطلب','التاريخ','اسم العميل','واتساب','الشركة',
        'الباقة','السعر','رقم التحويل','طريقة الدفع','الحالة',
        'تاريخ التفعيل','ملاحظات','إيصال الدفع','رقم التفعيل','باسورد فودافون'
      ]]);
      ordersSheet.getRange(1,1,1,15)
        .setBackground('#1a1a2e').setFontColor('#ffffff')
        .setFontWeight('bold').setHorizontalAlignment('center');
      ordersSheet.setFrozenRows(1);
      // ضبط عرض الأعمدة
      [150,140,160,130,100,200,80,130,110,110,140,200,200,130,150].forEach(function(w,i){
        ordersSheet.setColumnWidth(i+1, w);
      });
    }

    // --- شيت الباقات ---
    var pkgsSheet = ss.getSheetByName('📦 Packages') || ss.insertSheet('📦 Packages');
    if (pkgsSheet.getLastRow() === 0) {
      // سطر 1 عنوان لوحي
      pkgsSheet.getRange(1,1,1,8).setValues([[
        'معرّف الباقة','الشركة','اسم الباقة','السعر','النوع','الحالة','ملاحظات','تاريخ الإضافة'
      ]]);
      pkgsSheet.getRange(1,1,1,8)
        .setBackground('#7B2FBE').setFontColor('#ffffff')
        .setFontWeight('bold').setHorizontalAlignment('center');
      pkgsSheet.setFrozenRows(1);
      // صف 2 فارغ للعرض (يُحذف لو ما محتاجوش)
      [120,100,220,80,100,80,200,140].forEach(function(w,i){
        pkgsSheet.setColumnWidth(i+1, w);
      });
    }

    // --- شيت السجل ---
    var logsSheet = ss.getSheetByName('📝 Logs') || ss.insertSheet('📝 Logs');
    if (logsSheet.getLastRow() === 0) {
      logsSheet.getRange(1,1,1,4).setValues([['التاريخ والوقت','الإجراء','رقم الطلب/الكيان','التفاصيل']]);
      logsSheet.getRange(1,1,1,4)
        .setBackground('#1e1e38').setFontColor('#a0a0c8')
        .setFontWeight('bold').setHorizontalAlignment('center');
      logsSheet.setFrozenRows(1);
      [150,130,160,300].forEach(function(w,i){ logsSheet.setColumnWidth(i+1, w); });
    }

    // --- شيت الإعدادات ---
    var SETTINGS_KEYS = ['phone1Name','phone1','phone2Name','phone2','whatsappGroup','guaranteeLink','instapayNumber','cashNumber'];
    var setSheet = ss.getSheetByName('⚙️ Settings') || ss.insertSheet('⚙️ Settings');
    if (setSheet.getLastRow() === 0) {
      setSheet.getRange(1,1,1,2).setValues([['Key','Value']]);
      setSheet.getRange(1,1,1,2).setBackground('#1a1a2e').setFontColor('#fff').setFontWeight('bold');
      SETTINGS_KEYS.forEach(function(k){ setSheet.appendRow([k,'']); });
    }

    // حذف الشيت الافتراضية الفارغة "Sheet1" لو موجودة
    var defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
    }

    console.log('✅ تمت تهيئة Spreadsheet: ' + ss.getName());
    return true;
  } catch(err) {
    console.error('initClientSpreadsheet error: ' + err.toString());
    return false;
  }
}

// ============================================================
// 🔧 دالة يدوية: لتهيئة Spreadsheet موجود مسبقاً بالشيتات
// يمكن تشغيلها من Apps Script مرة واحدة لأي Spreadsheet
// ============================================================
function run_initExistingSheet() {
  // ✅ ضع هنا الـ Spreadsheet ID الذي تريد تهيئته
  var EXISTING_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
  var ss = SpreadsheetApp.openById(EXISTING_ID);
  var result = initClientSpreadsheet(ss);
  console.log(result ? '✅ تمت التهيئة بنجاح! رابط: ' + ss.getUrl() : '❌ فشلت التهيئة');
}


// دالة إعداد قاعدة البيانات المركزية لأول مرة
// يمكن لصاحب النظام تشغيل هذه الدالة مرة واحدة لإنشاء الـ Master Sheet
// ============================================================
function sa_setupMasterSheet() {
  try {
    // 1. إنشاء ملف جديد
    var ss = SpreadsheetApp.create("SaaS Master DB - Offers World");
    
    // 2. إعداد الشيت الأساسي للعملاء
    var sheet = ss.getSheets()[0];
    sheet.setName(SA_CONFIG.SHEETS.CLIENTS);
    
    // 3. كتابة رؤوس الأعمدة وتلوينها
    var headers = ['ClientID', 'Username', 'Password', 'CompanyName', 'SpreadsheetID', 'Status', 'ExpiryDate', 'CreatedAt', 'Notes', 'AppBrandName', 'AppLogoURL'];
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers])
         .setBackground("#8b3cf7")
         .setFontColor("#ffffff")
         .setFontWeight("bold")
         .setHorizontalAlignment("center");
         
    // 4. ضبط عرض الأعمدة وجعل الصف الأول ثابتاً
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150); // ClientID
    sheet.setColumnWidth(2, 120); // Username
    sheet.setColumnWidth(3, 120); // Password
    sheet.setColumnWidth(4, 150); // CompanyName
    sheet.setColumnWidth(5, 300); // SpreadsheetID
    sheet.setColumnWidth(6, 100); // Status
    sheet.setColumnWidth(7, 120); // ExpiryDate
    sheet.setColumnWidth(8, 150); // CreatedAt
    sheet.setColumnWidth(9, 200); // Notes
    sheet.setColumnWidth(10, 150); // AppBrandName
    sheet.setColumnWidth(11, 200); // AppLogoURL
    
    // 5. حفظ الـ ID في خصائص السكريبت كاحتياط
    PropertiesService.getScriptProperties().setProperty('SAAS_MASTER_ID', ss.getId());
    
    console.log("✅ تم إنشاء قاعدة البيانات المركزية بنجاح!");
    console.log("رابط الملف: " + ss.getUrl());
    console.log("الـ Spreadsheet ID المطلوب نسخه هو:");
    console.log(ss.getId());
    
    return {
      success: true,
      message: "تم إنشاء Master DB بنجاح!",
      spreadsheetId: ss.getId(),
      url: ss.getUrl()
    };

  } catch (err) {
    console.error("❌ فشل إنشاء قاعدة البيانات: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

// ============================================================
// 🎭 إنشاء عميل تجريبي (Demo) ببيانات وهمية كاملة
// شغّل هذه الدالة مرة واحدة من Apps Script لإنشاء الحساب التجريبي
// ============================================================
function createDemoClient() {
  try {
    var masterSS = SpreadsheetApp.openById(SA_CONFIG.MASTER_SPREADSHEET_ID);
    var sheet = masterSS.getSheetByName(SA_CONFIG.SHEETS.CLIENTS);
    if (!sheet) throw new Error('لم يتم العثور على Master Sheet');

    // ✅ التحقق إذا كان الديمو موجود مسبقاً
    var existing = sheet.getRange('B:B').createTextFinder('demo').matchEntireCell(true).findNext();
    if (existing) {
      console.log('⚠️ الحساب التجريبي موجود مسبقاً! Username: demo');
      return { success: false, message: 'الحساب التجريبي موجود بالفعل' };
    }

    // 1️⃣ إنشاء Spreadsheet خاص بالديمو
    var demoSS = SpreadsheetApp.create('تراكورا — عرض تجريبي 🎭');
    initClientSpreadsheet(demoSS);

    // 2️⃣ تعبئة باقات وهمية
    var pkgsSheet = demoSS.getSheetByName('📦 Packages');
    var now = Utilities.formatDate(new Date(), 'Africa/Cairo', 'dd/MM/yyyy HH:mm:ss');
    var mockPackages = [
      ['PKG-VF-001','فودافون','25 جيجا',105,'جيجا','متاح','',''],
      ['PKG-VF-002','فودافون','50 جيجا + 1000 دقيقة',175,'ميكس','متاح','',''],
      ['PKG-VF-003','فودافون','100 جيجا',220,'جيجا','متاح','عرض محدود',''],
      ['PKG-OR-001','أورانج','30 جيجا',99,'جيجا','متاح','',''],
      ['PKG-OR-002','أورانج','60 جيجا + مكالمات غير محدودة',185,'ميكس','متاح','الأوفر',''],
      ['PKG-OR-003','أورانج','10,000 دقيقة',145,'دقايق','متاح','',''],
      ['PKG-WE-001','وي','50 جيجا',130,'جيجا','متاح','',''],
      ['PKG-WE-002','وي','بلا حدود تيم',210,'ميكس','متاح','اشتراك شهري',''],
      ['PKG-ET-001','اتصالات','35 جيجا',115,'جيجا','متاح','',''],
      ['PKG-ET-002','اتصالات','80 جيجا + 2000 دقيقة',200,'ميكس','متاح','الأكثر مبيعاً',''],
    ];
    mockPackages.forEach(function(row) { row[7] = now; pkgsSheet.appendRow(row); });

    // 3️⃣ تعبئة طلبات وهمية
    var ordersSheet = demoSS.getSheetByName('📋 Orders');
    var mockOrders = [
      ['ORD-07010001','01/07/2026 09:15:22','أحمد محمود','01012345678','فودافون','50 جيجا + 1000 دقيقة',175,'7563','إنستا باي','تم التفعيل','02/07/2026 10:00:00','—','','01012345678',''],
      ['ORD-07010002','01/07/2026 11:30:00','سارة خالد','01112233445','أورانج','60 جيجا + مكالمات غير محدودة',185,'2891','إنستا باي','تم التفعيل','01/07/2026 14:00:00','تم التفعيل بدون مشاكل','','01112233445',''],
      ['ORD-07010003','02/07/2026 08:45:11','محمد عبدالله','01511223344','فودافون','100 جيجا',220,'4412','كاش','معلق','','بانتظار استلام الكاش','','01511223344','abc123'],
      ['ORD-07020001','02/07/2026 13:20:55','نور الدين','01211223300','وي','بلا حدود تيم',210,'9934','إنستا باي','تم التفعيل','03/07/2026 09:30:00','—','','01211223300',''],
      ['ORD-07020002','03/07/2026 10:05:33','فاطمة علي','01012223344','اتصالات','80 جيجا + 2000 دقيقة',200,'1123','إنستا باي','معلق','','ينتظر كود اتصالات','','01012223344',''],
      ['ORD-07030001','03/07/2026 15:40:00','كريم وليد','01511002233','أورانج','30 جيجا',99,'6678','إنستا باي','ملغي','','الغى العميل الطلب','','01511002233',''],
      ['ORD-07040001','04/07/2026 09:00:00','هبة سمير','01212345678','فودافون','25 جيجا',105,'3345','كاش','تم التفعيل','04/07/2026 11:00:00','—','','01212345678',''],
      ['ORD-07040002','04/07/2026 12:10:00','عمر حسن','01111223344','وي','50 جيجا',130,'8891','إنستا باي','تم التفعيل','04/07/2026 14:30:00','—','','01111223344',''],
      ['ORD-07050001','05/07/2026 08:20:00','مريم عادل','01011223344','اتصالات','35 جيجا',115,'5567','إنستا باي','معلق','','—','','01011223344',''],
      ['ORD-07050002','05/07/2026 10:55:00','يوسف طارق','01512233441','أورانج','10,000 دقيقة',145,'7712','إنستا باي','تم التفعيل','05/07/2026 13:00:00','—','','01512233441',''],
      ['ORD-07060001','06/07/2026 09:30:00','إسلام رضا','01012334455','فودافون','50 جيجا + 1000 دقيقة',175,'2244','إنستا باي','معلق','','—','','01012334455','xyz789'],
      ['ORD-07060002','06/07/2026 14:00:00','منى جمال','01111334455','وي','بلا حدود تيم',210,'6600','كاش','تم التفعيل','07/07/2026 09:00:00','—','','01111334455',''],
      ['ORD-07070001','07/07/2026 10:15:00','عبدالرحمن ياسر','01512244330','اتصالات','80 جيجا + 2000 دقيقة',200,'3311','إنستا باي','تم التفعيل','07/07/2026 12:00:00','—','','01512244330',''],
      ['ORD-07070002','07/07/2026 11:40:00','رنا مصطفى','01212334455','فودافون','100 جيجا',220,'9823','إنستا باي','معلق','','—','','01212334455','pass99'],
      ['ORD-07080001','08/07/2026 00:10:00','تجريبي Demo','01000000000','أورانج','60 جيجا + مكالمات غير محدودة',185,'0000','إنستا باي','معلق','','طلب تجريبي','','01000000000',''],
    ];
    mockOrders.forEach(function(row) { ordersSheet.appendRow(row); });

    // 4️⃣ تعبئة سجل النشاط
    var logsSheet = demoSS.getSheetByName('📝 Logs');
    var mockLogs = [
      ['01/07/2026 09:16:00','طلب جديد','ORD-07010001','فودافون - 50 جيجا + 1000 دقيقة'],
      ['02/07/2026 10:00:00','تغيير حالة','ORD-07010001','إلى تم التفعيل'],
      ['01/07/2026 11:31:00','طلب جديد','ORD-07010002','أورانج - 60 جيجا + مكالمات غير محدودة'],
      ['01/07/2026 14:00:00','تغيير حالة','ORD-07010002','إلى تم التفعيل'],
      ['02/07/2026 08:46:00','طلب جديد','ORD-07010003','فودافون - 100 جيجا'],
      ['02/07/2026 13:21:00','طلب جديد','ORD-07020001','وي - بلا حدود تيم'],
      ['03/07/2026 09:30:00','تغيير حالة','ORD-07020001','إلى تم التفعيل'],
      ['03/07/2026 10:06:00','طلب جديد','ORD-07020002','اتصالات - 80 جيجا'],
      ['03/07/2026 15:41:00','طلب جديد','ORD-07030001','أورانج - 30 جيجا'],
      ['03/07/2026 16:00:00','تغيير حالة','ORD-07030001','إلى ملغي'],
      ['04/07/2026 09:01:00','طلب جديد','ORD-07040001','فودافون - 25 جيجا'],
      ['04/07/2026 11:00:00','تغيير حالة','ORD-07040001','إلى تم التفعيل'],
      ['04/07/2026 12:11:00','طلب جديد','ORD-07040002','وي - 50 جيجا'],
      ['04/07/2026 14:30:00','تغيير حالة','ORD-07040002','إلى تم التفعيل'],
      ['05/07/2026 10:56:00','طلب جديد','ORD-07050002','أورانج - 10,000 دقيقة'],
      ['05/07/2026 13:00:00','تغيير حالة','ORD-07050002','إلى تم التفعيل'],
      ['06/07/2026 14:01:00','طلب جديد','ORD-07060002','وي - بلا حدود تيم'],
      ['07/07/2026 09:00:00','تغيير حالة','ORD-07060002','إلى تم التفعيل'],
      ['07/07/2026 10:16:00','طلب جديد','ORD-07070001','اتصالات - 80 جيجا'],
      ['07/07/2026 12:00:00','تغيير حالة','ORD-07070001','إلى تم التفعيل'],
      ['08/07/2026 00:11:00','طلب جديد','ORD-07080001','أورانج - عرض تجريبي'],
      ['07/07/2026 09:45:00','إضافة باقة','PKG-VF-001','فودافون - 25 جيجا'],
      ['07/07/2026 09:46:00','إضافة باقة','PKG-OR-002','أورانج - الأوفر'],
    ];
    mockLogs.forEach(function(row) { logsSheet.appendRow(row); });

    // 5️⃣ تسجيل الكلايند في Master Sheet
    var demoId = 'CL-DEMO-001';
    var expiryDate = Utilities.formatDate(
      new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
      'Africa/Cairo', 'yyyy-MM-dd'
    );
    sheet.appendRow([
      demoId,
      'demo',
      'demo1234',
      'شركة العرض التجريبي',
      demoSS.getId(),
      'فترة تجريبية',
      expiryDate,
      now,
      'حساب تجريبي — يمكن التعديل والاختبار بحرية',
      'تراكورا — عرض',
      'logo.png'
    ]);

    console.log('🎉 تم إنشاء الحساب التجريبي بنجاح!');
    console.log('👤 Username: demo');
    console.log('🔑 Password: demo1234');
    console.log('🆔 Client ID: ' + demoId);
    console.log('📊 رابط الـ Spreadsheet: ' + demoSS.getUrl());

    return {
      success: true,
      clientId: demoId,
      username: 'demo',
      password: 'demo1234',
      spreadsheetUrl: demoSS.getUrl(),
      spreadsheetId: demoSS.getId()
    };

  } catch (err) {
    console.error('❌ فشل إنشاء الديمو: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}
