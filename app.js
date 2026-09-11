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

  var videoWrap = $('videoWrap');
  var livePreview = $('livePreview');
  var recordCanvas = $('recordCanvas');
  var playbackPreview = $('playbackPreview');
  var recDot = $('recDot');
  var recTimer = $('recTimer');
  var videoInfo = $('videoInfo');
  var geoStatusEl = $('geoStatus');
  var zoomControl = $('zoomControl');
  var zoomSlider = $('zoomSlider');
  var zoomLabel = $('zoomLabel');

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

  var canvasCtx = recordCanvas.getContext('2d');
  var drawRafId = null;
  var isDrawing = false;
  var zoomLevel = 1;
  var geoPosition = null; // { lat, lng, acc }

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

    livePreview.addEventListener('loadedmetadata', function () {
      var vw = livePreview.videoWidth || 1280;
      var vh = livePreview.videoHeight || 720;
      recordCanvas.width = vw;
      recordCanvas.height = vh;
    });

    zoomSlider.addEventListener('input', function () {
      zoomLevel = parseFloat(zoomSlider.value) || 1;
      zoomLabel.textContent = zoomLevel.toFixed(1) + 'x';
    });
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
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }).then(function (stream) {
      mediaStream = stream;
      livePreview.srcObject = stream;
      playbackPreview.classList.add('hidden');
      btnOpenCamera.classList.add('hidden');
      btnStartRec.classList.remove('hidden');
      zoomLevel = 1;
      zoomSlider.value = '1';
      zoomLabel.textContent = '1.0x';
      zoomControl.classList.remove('hidden');
      applyContinuousFocus_(stream);
      startDrawLoop_();
      requestGeo_();
    }).catch(function (err) {
      alert('Không mở được camera/micro: ' + err.message + '\nHãy cấp quyền Camera & Micro cho trình duyệt trong Cài đặt máy.');
    });
  }

  // Bật lấy nét liên tục (continuous auto-focus) nếu thiết bị hỗ trợ, để video luôn nét
  function applyContinuousFocus_(stream) {
    try {
      var track = stream.getVideoTracks()[0];
      if (!track || !track.getCapabilities) return;
      var caps = track.getCapabilities();
      if (caps.focusMode && caps.focusMode.indexOf('continuous') !== -1) {
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
      }
    } catch (e) { /* trình duyệt không hỗ trợ, bỏ qua */ }
  }

  // ---- Vòng lặp vẽ khung hình + chèn ngày giờ/định vị lên canvas ----
  // (Canvas này vừa là hình xem trước, vừa là nguồn quay video -> ngày giờ/vị trí
  // được "khắc" thẳng vào file video để tăng tính xác thực.)
  function startDrawLoop_() {
    if (isDrawing) return;
    isDrawing = true;
    drawFrame_();
  }

  function stopDrawLoop_() {
    isDrawing = false;
    if (drawRafId) {
      cancelAnimationFrame(drawRafId);
      drawRafId = null;
    }
  }

  function drawFrame_() {
    if (!isDrawing) return;
    var vw = livePreview.videoWidth;
    var vh = livePreview.videoHeight;
    if (vw && vh) {
      if (recordCanvas.width !== vw || recordCanvas.height !== vh) {
        recordCanvas.width = vw;
        recordCanvas.height = vh;
      }
      var z = zoomLevel || 1;
      var cw = vw / z;
      var ch = vh / z;
      var cx = (vw - cw) / 2;
      var cy = (vh - ch) / 2;
      canvasCtx.drawImage(livePreview, cx, cy, cw, ch, 0, 0, recordCanvas.width, recordCanvas.height);
      drawOverlay_(recordCanvas.width, recordCanvas.height);
    }
    drawRafId = requestAnimationFrame(drawFrame_);
  }

  function drawOverlay_(w, h) {
    var pad = Math.max(10, Math.round(w * 0.018));
    var fontSize = Math.max(16, Math.round(w * 0.032));
    var now = new Date();
    var dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', { hour12: false });
    var geoStr = geoPosition
      ? '📍 ' + geoPosition.lat.toFixed(5) + ', ' + geoPosition.lng.toFixed(5)
      : '📍 Đang lấy vị trí...';

    var lines = [dateStr, geoStr];
    canvasCtx.font = fontSize + 'px -apple-system, Roboto, Arial, sans-serif';
    canvasCtx.textBaseline = 'bottom';

    var lineHeight = fontSize * 1.35;
    var boxHeight = lineHeight * lines.length + pad;
    var maxWidth = 0;
    lines.forEach(function (line) {
      var mw = canvasCtx.measureText(line).width;
      if (mw > maxWidth) maxWidth = mw;
    });
    var boxWidth = maxWidth + pad * 2;
    var boxX = pad;
    var boxY = h - boxHeight - pad;

    canvasCtx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect_(canvasCtx, boxX, boxY, boxWidth, boxHeight, 8);
    canvasCtx.fill();

    canvasCtx.fillStyle = '#ffffff';
    lines.forEach(function (line, i) {
      var ty = boxY + pad / 2 + lineHeight * (i + 1);
      canvasCtx.fillText(line, boxX + pad, ty);
    });
  }

  function roundRect_(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- Định vị GPS (chèn vào video để xác thực nơi quay) ----
  function requestGeo_() {
    if (!navigator.geolocation) {
      geoPosition = null;
      geoStatusEl.textContent = 'Thiết bị/trình duyệt không hỗ trợ định vị.';
      return;
    }
    geoStatusEl.textContent = '📍 Đang lấy vị trí...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      geoPosition = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy
      };
      geoStatusEl.textContent = '📍 Đã lấy vị trí (sai số ~' + Math.round(pos.coords.accuracy) + 'm)';
    }, function (err) {
      geoPosition = null;
      geoStatusEl.textContent = '⚠️ Không lấy được vị trí (' + (err.code === 1 ? 'chưa cấp quyền định vị' : 'lỗi định vị') + '). Video vẫn quay được, chỉ thiếu vị trí trên video.';
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  }

  function startRecording_() {
    if (!mediaStream) return;
    recordedChunks = [];
    recordedMimeType = pickMimeType_();

    var canvasStream = recordCanvas.captureStream(30);
    var combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach(function (t) { combinedStream.addTrack(t); });
    mediaStream.getAudioTracks().forEach(function (t) { combinedStream.addTrack(t); });

    var options = {};
    if (recordedMimeType) options.mimeType = recordedMimeType;
    options.videoBitsPerSecond = 8 * 1000 * 1000; // ~8 Mbps để hình nét
    options.audioBitsPerSecond = 128 * 1000;

    try {
      mediaRecorder = new MediaRecorder(combinedStream, options);
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

    // Toàn màn hình khi quay để lấy được khung hình rộng hơn
    document.body.classList.add('recording-fullscreen');
    videoWrap.classList.add('fullscreen');
  }

  function stopRecording_() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    clearInterval(recTimerInterval);
    recDot.classList.add('hidden');
    btnStopRec.classList.add('hidden');
    document.body.classList.remove('recording-fullscreen');
    videoWrap.classList.remove('fullscreen');
  }

  function onRecordingStopped_() {
    recordedBlob = new Blob(recordedChunks, { type: recordedMimeType || 'video/webm' });

    stopDrawLoop_();

    // Tắt camera sau khi quay xong để tiết kiệm pin
    if (mediaStream) {
      mediaStream.getTracks().forEach(function (t) { t.stop(); });
      mediaStream = null;
    }

    zoomControl.classList.add('hidden');
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
    geoStatusEl.textContent = '';
    btnRetake.classList.add('hidden');
    btnOpenCamera.classList.remove('hidden');
    resultMsg.textContent = '';
    resultMsg.className = '';
    if (recordCanvas.width && recordCanvas.height) {
      canvasCtx.clearRect(0, 0, recordCanvas.width, recordCanvas.height);
    }
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
  // Upload: gửi video theo từng phần (base64) lên chính GAS (cùng domain,
  // không bị CORS) — CHÍNH SERVER (Apps Script) mới là bên PUT video lên
  // Drive, trình duyệt của nhân viên KHÔNG PUT thẳng lên googleapis.com nữa.
  //
  // Lý do đổi cách này: trên iPhone/Safari, PUT trực tiếp từ trình duyệt lên
  // googleapis.com hay bị báo "Load failed" dù mạng khỏe (Safari có nhiều lý
  // do hủy ngầm loại request cross-origin lớn này: tiết kiệm pin, ITP, chặn
  // riêng tư, chuyển mạng...). Việc đó KHÔNG tự thử lại được vì bản chất là
  // trình duyệt từ chối gửi tiếp, không phải mất gói tin. Do đó bản này bỏ
  // hẳn cách PUT thẳng, chuyển sang: trình duyệt POST dữ liệu (giống hệt
  // kiểu initUpload/logRow đã chạy ổn định) -> Apps Script nhận rồi tự đẩy
  // tiếp lên Drive. Mỗi phần vẫn tự động thử lại nếu lỗi mạng.
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

    uploadViaGasRelay_(recordedBlob, fileName, recordedBlob.type || 'video/mp4', setProgress_)
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
        showResult_(false, '❌ Lỗi: ' + (err && err.message ? err.message : err));
        btnUpload.disabled = false;
      });
  }

  // Cắt blob thành từng phần theo CHUNK_SIZE (phải là bội số 256KB theo yêu
  // cầu resumable upload của Google — CHUNK_SIZE mặc định 8MB đã thỏa),
  // gửi từng phần dạng base64 lên GAS bằng postJson_ (tự thử lại sẵn có).
  // Chunk đầu tiên kèm fileName/mimeType để server mở phiên upload Drive;
  // server lưu sessionUrl đó (theo uploadId) để dùng cho các chunk tiếp theo.
  function uploadViaGasRelay_(blob, fileName, mimeType, onProgress) {
    var total = blob.size;
    var uploadId = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    var chunkIndex = 0;

    function sendFrom(start) {
      var end = Math.min(start + CHUNK_SIZE, total) - 1; // inclusive
      var sliceBlob = blob.slice(start, end + 1);
      return sliceBlob.arrayBuffer().then(function (buf) {
        var payload = {
          action: 'uploadChunk',
          accessCode: ACCESS_CODE,
          uploadId: uploadId,
          chunkIndex: chunkIndex,
          start: start,
          end: end,
          totalBytes: total,
          data: arrayBufferToBase64_(buf)
        };
        if (chunkIndex === 0) {
          payload.fileName = fileName;
          payload.mimeType = mimeType;
        }
        // Chunk lớn nên GAS xử lý có thể mất vài giây -> cho thử lại nhiều
        // lần với thời gian chờ tăng dần, đồng thời không cần trình duyệt
        // tự lo việc PUT/CORS/resume nữa (server lo hết phần đó rồi).
        return postJson_(GAS_URL, payload, 6, 2000).then(function (res) {
          if (!res.ok) throw new Error(res.error || 'Lỗi khi gửi phần dữ liệu video lên máy chủ');
          var pct = Math.round(((end + 1) / total) * 100);
          if (onProgress) onProgress(pct);
          chunkIndex++;
          if (res.done) return res.file;
          return sendFrom(end + 1);
        });
      });
    }

    return sendFrom(0);
  }

  // Chuyển ArrayBuffer -> chuỗi base64, chia nhỏ khi gọi String.fromCharCode
  // để tránh tràn stack với video vài MB trở lên.
  function arrayBufferToBase64_(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var STEP = 0x8000; // 32768
    for (var i = 0; i < bytes.length; i += STEP) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
    }
    return btoa(binary);
  }

  // Gọi API GAS dạng JSON, tự thử lại vài lần với thời gian chờ tăng dần
  // nếu mạng chập chờn (hay gặp trên di động).
  function postJson_(url, body, retriesLeft, baseDelayMs) {
    if (retriesLeft === undefined) retriesLeft = 5;
    if (baseDelayMs === undefined) baseDelayMs = 1500;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tránh CORS preflight với Apps Script
      body: JSON.stringify(body)
    }).then(function (res) { return res.json(); })
      .catch(function (err) {
        if (retriesLeft <= 0) throw err;
        return sleep_(baseDelayMs).then(function () {
          return postJson_(url, body, retriesLeft - 1, Math.min(baseDelayMs * 1.6, 10000));
        });
      });
  }

  function setProgress_(pct, statusText) {
    if (pct !== null && pct !== undefined) {
      progressFill.style.width = pct + '%';
      progressText.textContent = statusText ? (pct + '% — ' + statusText) : (pct + '%');
    } else if (statusText) {
      progressText.textContent = statusText;
    }
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
    progressWrap.classList.add('hidden');
    setProgress_(0);
    btnUpload.disabled = true;
    if (recordCanvas.width && recordCanvas.height) {
      canvasCtx.clearRect(0, 0, recordCanvas.width, recordCanvas.height);
    }
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
