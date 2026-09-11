// ============================================================================
// APP QUAY VIDEO XÁC NHẬN ĐƠN HÀNG - FRONT-END LOGIC
// ============================================================================
(function () {
  'use strict';

 var CFG = window.APP_CONFIG || {};
  var GAS_URL = CFG.GAS_WEB_APP_URL;
  var CHUNK_SIZE = CFG.CHUNK_SIZE || 8 * 1024 * 1024;
  var ACCESS_CODE = CFG.ACCESS_CODE || '';

 // ---- DOM refs ----
 var $ = function (id) { return document.getElementById(id); };
  var orderCodeEl = $('orderCode');
  var callerNameEl = $('callerName');
  var callDateEl = $('callDate');
  var reasonEl = $('reason');
  var reasonOtherEl = $('reasonOther');
  var staffNoteEl = $('staffNote');
  var statusPill = $('statusPill');

 var livePreview = $('livePreview');
  var playbackPreview = $('playbackPreview');
  var recDot = $('recDot');
  var recTimer = $('recTimer');
  var videoInfo = $('videoInfo');

 var btnOpenCamera = $('btnOpenCamera');
  var btnStartRec = $('btnStartRec');
  var btnStopRec = $('btnStopRec');
  var btnRetake = $('btnRetake');
  var btnUpload = $('btnUpload');
  var btnScan = $('btnScan');
  var btnCloseScan = $('btnCloseScan');

 var scanModal = $('scanModal');
  var progressWrap = $('progressWrap');
  var progressFill = $('progressFill');
  var progressText = $('progressText');
  var resultMsg = $('resultMsg');

 // ---- State ----
 var mediaStream = null;
  var mediaRecorder = null;
  var recordedChunks = [];
  var recordedBlob = null;
  var recordedMimeType = '';
  var recTimerInterval = null;
  var recSeconds = 0;
  var html5QrCode = null;

 // ============================================================================
 // Khởi tạo
 // ============================================================================
 init();

 function init() {
   callDateEl.value = todayStr_();
   loadConfig_();
   bindEvents_();
 }

 function bindEvents_() {
   orderCodeEl.addEventListener('input', function () {
     var pos = orderCodeEl.selectionStart;
     orderCodeEl.value = orderCodeEl.value.toUpperCase();
     orderCodeEl.setSelectionRange(pos, pos);
     validateForm_();
   });

  reasonEl.addEventListener('change', function () {
    if (reasonEl.value === '__OTHER__') {
      reasonOtherEl.classList.remove('hidden');
    } else {
      reasonOtherEl.classList.add('hidden');
      reasonOtherEl.value = '';
    }
    validateForm_();
  });

  [callerNameEl, callDateEl, reasonOtherEl].forEach(function (el) {
    el.addEventListener('change', validateForm_);
    el.addEventListener('input', validateForm_);
  });

  btnScan.addEventListener('click', openScanner_);
   btnCloseScan.addEventListener('click', closeScanner_);

  btnOpenCamera.addEventListener('click', openCamera_);
   btnStartRec.addEventListener('click', startRecording_);
   btnStopRec.addEventListener('click', stopRecording_);
   btnRetake.addEventListener('click', retake_);

  btnUpload.addEventListener('click', doUpload_);
 }

 // ============================================================================
 // Config từ GAS (danh sách Người gọi / Lý do) + kiểm tra kết nối
 // ============================================================================
 function loadConfig_() {
   if (!GAS_URL || GAS_URL.indexOf('DÁN_URL') !== -1) {
     setStatus_('error', 'Chưa cấu hình GAS_WEB_APP_URL trong config.js');
     fillFallbackConfig_();
     return;
   }

  fetch(GAS_URL + '?action=config')
   .then(function (res) { return res.json(); })
   .then(function (data) {
     if (!data.ok) throw new Error(data.error || 'Lỗi không xác định');
     fillSelect_(callerNameEl, data.callers, '-- Chọn người gọi --');
     fillSelect_(reasonEl, data.reasons, '-- Chọn lý do --', true);
     setStatus_('ok', data.usingFallback ? 'Đã kết nối (đang dùng danh sách mặc định)' : 'Đã kết nối');
   })
   .catch(function (err) {
     setStatus_('error', 'Không kết nối được máy chủ: ' + err.message);
     fillFallbackConfig_();
   });
 }

 function fillFallbackConfig_() {
   fillSelect_(callerNameEl, ['Nhân viên A', 'Nhân viên B'], '-- Chọn người gọi --');
   fillSelect_(reasonEl, ['Khách đã xác nhận nhận hàng', 'Không nghe máy', 'Khác'], '-- Chọn lý do --', true);
 }

 function fillSelect_(selectEl, items, placeholder, addOtherOption) {
   selectEl.innerHTML = '';
   var ph = document.createElement('option');
   ph.value = '';
   ph.textContent = placeholder;
   selectEl.appendChild(ph);
   (items || []).forEach(function (item) {
     var opt = document.createElement('option');
     opt.value = item;
     opt.textContent = item;
     selectEl.appendChild(opt);
   });
   if (addOtherOption) {
     var other = document.createElement('option');
     other.value = '__OTHER__';
     other.textContent = 'Khác (nhập tay)';
     selectEl.appendChild(other);
   }
 }

 function setStatus_(kind, text) {
   statusPill.className = 'pill pill-' + kind;
   statusPill.textContent = text;
 }

 // ============================================================================
 // Quét mã QR / Barcode
 // ============================================================================
 function openScanner_() {
   scanModal.classList.remove('hidden');
   if (typeof Html5Qrcode === 'undefined') {
     alert('Không tải được thư viện quét mã. Kiểm tra kết nối mạng.');
     return;
   }
   html5QrCode = new Html5Qrcode('reader');
   var config = {
     fps: 10,
     qrbox: { width: 260, height: 260 },
     formatsToSupport: [
       Html5QrcodeSupportedFormats.QR_CODE,
       Html5QrcodeSupportedFormats.CODE_128,
       Html5QrcodeSupportedFormats.CODE_39,
       Html5QrcodeSupportedFormats.EAN_13,
       Html5QrcodeSupportedFormats.EAN_8,
       Html5QrcodeSupportedFormats.UPC_A,
       Html5QrcodeSupportedFormats.UPC_E,
       Html5QrcodeSupportedFormats.ITF,
       Html5QrcodeSupportedFormats.CODABAR
       ]
   };
   html5QrCode.start({ facingMode: 'environment' }, config, function (decodedText) {
     orderCodeEl.value = String(decodedText).toUpperCase().trim();
     validateForm_();
     closeScanner_();
   }, function () { /* bỏ qua lỗi từng khung hình */ })
   .catch(function (err) {
     alert('Không mở được camera để quét mã: ' + err);
     closeScanner_();
   });
 }

 function closeScanner_() {
   scanModal.classList.add('hidden');
   if (html5QrCode) {
     html5QrCode.stop().then(function () {
       html5QrCode.clear();
       html5QrCode = null;
     }).catch(function () { html5QrCode = null; });
   }
 }

 // ============================================================================
 // Quay video
 // ============================================================================
 function openCamera_() {
   if (mediaStream) return;
   navigator.mediaDevices.getUserMedia({
     video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
     audio: true
   }).then(function (stream) {
     mediaStream = stream;
     livePreview.srcObject = stream;
     livePreview.classList.remove('hidden');
     playbackPreview.classList.add('hidden');
     btnOpenCamera.classList.add('hidden');
     btnStartRec.classList.remove('hidden');
   }).catch(function (err) {
     alert('Không mở được camera/micro: ' + err.message + '\nHãy cấp quyền Camera & Micro cho trình duyệt trong Cài đặt máy.');
   });
 }

 function startRecording_() {
   if (!mediaStream) return;
   recordedChunks = [];
   recordedMimeType = pickMimeType_();

  var options = recordedMimeType ? { mimeType: recordedMimeType } : undefined;
   try {
     mediaRecorder = new MediaRecorder(mediaStream, options);
   } catch (err) {
     alert('Thiết bị không hỗ trợ quay video: ' + err.message);
     return;
   }

  mediaRecorder.ondataavailable = function (e) {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
   mediaRecorder.onstop = onRecordingStopped_;
   mediaRecorder.start(1000);

  recSeconds = 0;
   recTimer.textContent = '00:00';
   recDot.classList.remove('hidden');
   recTimerInterval = setInterval(function () {
     recSeconds++;
     var m = String(Math.floor(recSeconds / 60)).padStart(2, '0');
     var s = String(recSeconds % 60).padStart(2, '0');
     recTimer.textContent = m + ':' + s;
   }, 1000);

  btnStartRec.classList.add('hidden');
   btnStopRec.classList.remove('hidden');
 }

 function stopRecording_() {
   if (mediaRecorder && mediaRecorder.state !== 'inactive') {
     mediaRecorder.stop();
   }
   clearInterval(recTimerInterval);
   recDot.classList.add('hidden');
   btnStopRec.classList.add('hidden');
 }

 function onRecordingStopped_() {
   recordedBlob = new Blob(recordedChunks, { type: recordedMimeType || 'video/webm' });

  // Tắt camera sau khi quay xong để tiết kiệm pin
  if (mediaStream) {
    mediaStream.getTracks().forEach(function (t) { t.stop(); });
    mediaStream = null;
  }

  livePreview.classList.add('hidden');
   playbackPreview.src = URL.createObjectURL(recordedBlob);
   playbackPreview.classList.remove('hidden');

  var sizeMb = (recordedBlob.size / (1024 * 1024)).toFixed(1);
   videoInfo.textContent = 'Thời lượng: ' + recTimer.textContent + ' — Dung lượng: ' + sizeMb + ' MB';

  btnRetake.classList.remove('hidden');
   validateForm_();
 }

 function retake_() {
   recordedBlob = null;
   recordedChunks = [];
   playbackPreview.classList.add('hidden');
   playbackPreview.src = '';
   videoInfo.textContent = '';
   btnRetake.classList.add('hidden');
   btnOpenCamera.classList.remove('hidden');
   livePreview.classList.remove('hidden');
   resultMsg.textContent = '';
   resultMsg.className = '';
   validateForm_();
 }

 function pickMimeType_() {
   var candidates = [
     'video/mp4;codecs=h264,aac', // ưu tiên iPhone Safari
     'video/mp4',
     'video/webm;codecs=vp9,opus',
     'video/webm;codecs=vp8,opus',
     'video/webm'
     ];
   for (var i = 0; i < candidates.length; i++) {
     if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) {
       return candidates[i];
     }
   }
   return '';
 }

 // ============================================================================
 // Validate form
 // ============================================================================
 function validateForm_() {
   var ok = orderCodeEl.value.trim() !== '' &&
     callerNameEl.value !== '' &&
     callDateEl.value !== '' &&
     getReasonValue_() !== '' &&
     recordedBlob !== null;
   btnUpload.disabled = !ok;
   return ok;
 }

 function getReasonValue_() {
   if (reasonEl.value === '__OTHER__') return reasonOtherEl.value.trim();
   return reasonEl.value;
 }

 // ============================================================================
 // Upload: mở phiên resumable qua GAS, PUT chunk thẳng lên Drive, rồi logRow
 // ============================================================================
 function doUpload_() {
   if (!validateForm_()) return;
   if (!GAS_URL || GAS_URL.indexOf('DÁN_URL') !== -1) {
     showResult_(false, 'Chưa cấu hình GAS_WEB_APP_URL trong config.js');
     return;
   }

  btnUpload.disabled = true;
   resultMsg.textContent = '';
   resultMsg.className = '';
   progressWrap.classList.remove('hidden');
   setProgress_(0);

  var orderCode = orderCodeEl.value.trim().toUpperCase();
   var ext = (recordedMimeType.indexOf('mp4') !== -1) ? 'mp4' : 'webm';
   var fileName = orderCode + '.' + ext;

  postJson_(GAS_URL, { action: 'initUpload', accessCode: ACCESS_CODE, fileName: fileName, mimeType: recordedBlob.type || 'video/mp4' })
   .then(function (initRes) {
     if (!initRes.ok) throw new Error(initRes.error || 'Không mở được phiên upload');
     return uploadInChunks_(initRes.sessionUrl, recordedBlob, setProgress_);
   })
   .then(function (driveFile) {
     if (!driveFile || !driveFile.id) {
       throw new Error('Upload dường như đã xong nhưng không nhận được xác nhận từ Drive. Vui lòng kiểm tra thư mục Drive, có thể cần thử lại.');
     }
     setProgress_(100);
     return postJson_(GAS_URL, {
       action: 'logRow',
       accessCode: ACCESS_CODE,
       orderCode: orderCode,
       callerName: callerNameEl.value,
       callDate: callDateEl.value,
       reason: getReasonValue_(),
       staffNote: staffNoteEl.value.trim(),
       fileName: fileName,
       fileId: driveFile.id || '',
       fileUrl: driveFile.webViewLink || ('https://drive.google.com/file/d/' + driveFile.id + '/view')
     });
   })
   .then(function (logRes) {
     if (!logRes.ok) throw new Error(logRes.error || 'Ghi Sheet thất bại (video đã upload lên Drive)');
     showResult_(true, '✅ Đã tải video lên Drive và ghi vào Sheet thành công!');
     resetFormAfterSuccess_();
   })
   .catch(function (err) {
     showResult_(false, '❌ Lỗi: ' + err.message);
     btnUpload.disabled = false;
   });
 }

 function uploadInChunks_(sessionUrl, blob, onProgress) {
   var total = blob.size;

  function putRange(start, end) {
    var chunk = blob.slice(start, end);
    return fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + total },
      body: chunk
    });
  }

  function queryStatus() {
    return fetch(sessionUrl, {
      method: 'PUT',
      headers: { 'Content-Range': 'bytes */' + total }
    }).then(function (res) {
      if (res.status === 308) {
        var range = res.headers.get('range');
        if (range) {
          var m = /bytes=0-(\d+)/.exec(range);
          if (m) return parseInt(m[1], 10) + 1;
        }
        return 0;
      }
      if (res.status === 200 || res.status === 201) return total;
      return null;
    }).catch(function () { return null; });
  }

  function attemptChunk(offset, retriesLeft) {
    var end = Math.min(offset + CHUNK_SIZE, total);
    return putRange(offset, end).then(function (res) {
      if (res.status === 308) {
        onProgress(Math.round((end / total) * 100));
        return loop(end);
      }
      if (res.status === 200 || res.status === 201) {
        onProgress(100);
        return res.json();
      }
      // Lỗi HTTP khác -> thử đồng bộ lại vị trí rồi retry
                                      return res.text().then(function (txt) {
                                        throw new Error('HTTP ' + res.status + ': ' + txt.slice(0, 200));
                                      });
    }).catch(function (err) {
      if (retriesLeft <= 0) throw err;
      return sleep_(1500).then(queryStatus).then(function (resumeOffset) {
        var nextOffset = (resumeOffset === null) ? offset : resumeOffset;
        return attemptChunk(nextOffset, retriesLeft - 1);
      });
    });
  }

  function loop(offset) {
    if (offset >= total) return queryStatus().then(function () { return null; });
    return attemptChunk(offset, 5);
  }

  return loop(0);
 }

 function postJson_(url, body) {
   return fetch(url, {
     method: 'POST',
     headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tránh CORS preflight với Apps Script
     body: JSON.stringify(body)
   }).then(function (res) { return res.json(); });
 }

 function setProgress_(pct) {
   progressFill.style.width = pct + '%';
   progressText.textContent = pct + '%';
 }

 function showResult_(ok, text) {
   resultMsg.textContent = text;
   resultMsg.className = ok ? 'ok' : 'error';
 }

 function resetFormAfterSuccess_() {
   orderCodeEl.value = '';
   reasonEl.value = '';
   reasonOtherEl.classList.add('hidden');
   reasonOtherEl.value = '';
   staffNoteEl.value = '';
   recordedBlob = null;
   recordedChunks = [];
   playbackPreview.classList.add('hidden');
   playbackPreview.src = '';
   videoInfo.textContent = '';
   btnRetake.classList.add('hidden');
   btnOpenCamera.classList.remove('hidden');
   livePreview.classList.remove('hidden');
   progressWrap.classList.add('hidden');
   setProgress_(0);
   btnUpload.disabled = true;
   // Giữ nguyên "Người gọi" và "Ngày gọi" vì thường gọi nhiều đơn liên tiếp trong ngày
 }

 function sleep_(ms) {
   return new Promise(function (resolve) { setTimeout(resolve, ms); });
 }

 function todayStr_() {
   try {
     return new Intl.DateTimeFormat('en-CA', {
       timeZone: 'Asia/Saigon', year: 'numeric', month: '2-digit', day: '2-digit'
     }).format(new Date());
   } catch (e) {
     return new Date().toISOString().slice(0, 10);
   }
 }

})();
