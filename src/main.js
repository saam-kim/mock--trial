// 사건수첩: 판결의 조건 - 메인 애플리케이션 로직
window.MockTrial = window.MockTrial || {};

// 전역 상태 변수
let sessionData = null;
let sessionId = null;
let myName = "";
let myRole = "";
let myTeam = "";
let userType = "student"; // "student" | "teacher"
let timerInterval = null;

// 비주얼 노벨 진행 상태
let vnCurrentStep = 0;

// 선택된 증거 임시 저장
let selectedEvidenceId = null;

// 1. 로그인 탭 전환
function switchLoginTab(type) {
  userType = type;
  const studentBtn = document.getElementById("tab-student-btn");
  const teacherBtn = document.getElementById("tab-teacher-btn");
  const studentForm = document.getElementById("student-login-form");
  const teacherForm = document.getElementById("teacher-login-form");
  const cardTitle = document.getElementById("login-card-title");

  if (type === "student") {
    if (studentBtn) studentBtn.style.display = "none";
    if (teacherBtn) teacherBtn.style.display = "inline-flex";
    if (studentForm) studentForm.style.display = "block";
    if (teacherForm) teacherForm.style.display = "none";
    if (cardTitle) cardTitle.innerText = "학생 접속하기";
  } else {
    if (teacherBtn) teacherBtn.style.display = "none";
    if (studentBtn) studentBtn.style.display = "inline-flex";
    if (teacherForm) teacherForm.style.display = "block";
    if (studentForm) studentForm.style.display = "none";
    if (cardTitle) cardTitle.innerText = "교사 로그인";
    setTimeout(() => {
      const pinInput = document.getElementById("teacher-pin");
      if (pinInput) pinInput.focus();
    }, 50);
  }
}

// 2. 교사 로그인 처리
function handleTeacherLogin(event) {
  event.preventDefault();
  const pin = document.getElementById("teacher-pin").value;
  if (pin !== "1234") {
    alert("올바르지 않은 교사 PIN 번호입니다.");
    return;
  }

  // 세션 개설
  sessionId = window.MockTrial.DB.createSession();
  myName = "교사 (재판장)";
  myRole = "teacher";
  myTeam = "teacher";
  userType = "teacher";

  showScreen("teacher-screen");
  
  // 실시간 동기화 바인딩
  window.MockTrial.DB.onSessionUpdate(sessionId, (data) => {
    sessionData = data;
    updateTeacherDashboard(data);
  });

  // 교사 전용 1초 주기 타이머 작동 (로컬 동기화용)
  startTeacherTimerLoop();
}

// 3. 학생 로그인 처리
function handleStudentLogin(event) {
  event.preventDefault();
  const codeInput = document.getElementById("student-session-code").value.toString();
  const nameInput = document.getElementById("student-name").value.trim();

  if (!nameInput) {
    alert("이름을 입력해 주세요.");
    return;
  }

  // 세션 입장 시도
  const result = window.MockTrial.DB.joinSession(codeInput, nameInput);
  if (!result.success) {
    alert(result.message);
    return;
  }

  sessionId = codeInput;
  myName = nameInput;
  userType = "student";

  // 튕김 복구를 위해 세션스토리지에 세션 번호와 학생 이름 저장
  sessionStorage.setItem("reconnect_session_id", sessionId);
  sessionStorage.setItem("reconnect_student_name", myName);

  // 대기화면 표시
  document.getElementById("wait-session-code").innerText = sessionId;
  showScreen("waiting-screen");

  // 실시간 동기화 바인딩
  window.MockTrial.DB.onSessionUpdate(sessionId, (data) => {
    sessionData = data;
    const me = data.students[myName];
    
    if (me) {
      myRole = me.role;
      myTeam = me.team;
    }

    // 모둠 배정이 완료되었고, 재판이 활성화된 경우
    if (myTeam && myRole) {
      // 대기화면을 벗어나 메인 재판 화면으로 진입
      if (document.getElementById("waiting-screen").classList.contains("active") || 
          document.getElementById("login-screen").classList.contains("active")) {
        showScreen("trial-screen");
        
        // 도입부 1단계인 경우 비주얼 노벨 실행
        if (data.currentStage === 1) {
          startVisualNovel();
        } else {
          showRoleGuidelinePopup();
        }
      }
      
      // 메인 UI 업데이트
      updateStudentDashboard(data);
    } else {
      // 역할 미배정 대기 상태
      document.getElementById("my-assigned-badge").style.display = "none";
      showScreen("waiting-screen");
    }
  });

  // 브라우저 닫거나 이탈 시 퇴장 처리
  window.addEventListener("beforeunload", () => {
    window.MockTrial.DB.disconnectStudent(sessionId, myName);
  });
}

// 4. 화면 전환 유틸리티
function showScreen(screenId) {
  const screens = document.querySelectorAll(".screen");
  screens.forEach((s) => {
    s.classList.remove("active");
    s.style.display = "none";
  });

  const activeScreen = document.getElementById(screenId);
  activeScreen.style.display = "flex";
  // 리플로우 강제 후 트랜지션 효과
  setTimeout(() => {
    activeScreen.classList.add("active");
  }, 50);
}

// 5. 교사용 타이머 틱 루프 (싱크 관리)
function startTeacherTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (sessionData && sessionData.timer.isRunning) {
      window.MockTrial.DB.controlTimer(sessionId, "tick");
    }
  }, 1000);
}

// 교사용 타이머 설정 및 시작/일시정지
function teacherSetTimer() {
  const duration = parseInt(document.getElementById("teacher-timer-duration").value);
  if (isNaN(duration) || duration <= 0) return;
  window.MockTrial.DB.controlTimer(sessionId, "set", duration);
}

function toggleTeacherTimer() {
  const btn = document.getElementById("teacher-timer-btn");
  if (sessionData.timer.isRunning) {
    window.MockTrial.DB.controlTimer(sessionId, "pause");
    btn.innerText = "타이머 시작";
  } else {
    window.MockTrial.DB.controlTimer(sessionId, "start");
    btn.innerText = "타이머 일시정지";
  }
}

// 6. 교사 단계(진도) 제어
function teacherChangeStage(stageIndex) {
  window.MockTrial.DB.setStage(sessionId, stageIndex);
}

function teacherNextStage() {
  if (sessionData.currentStage < 6) {
    window.MockTrial.DB.setStage(sessionId, sessionData.currentStage + 1);
  } else {
    alert("마지막 단계입니다. 판결문을 인쇄해 주세요.");
  }
}

// 7. 교사용 대시보드 UI 업데이트
function updateTeacherDashboard(data) {
  document.getElementById("session-code-val").innerText = data.sessionId;
  
  // 타이머 렌더링
  const mins = Math.floor(data.timer.timeLeft / 60).toString().padStart(2, "0");
  const secs = (data.timer.timeLeft % 60).toString().padStart(2, "0");
  const timerBtn = document.getElementById("teacher-timer-btn");
  timerBtn.innerText = data.timer.isRunning ? "타이머 일시정지" : "타이머 시작";
  
  // 단계 네비게이션 동기화
  const steps = document.querySelectorAll(".timeline-step");
  steps.forEach((step) => {
    const sIdx = parseInt(step.getAttribute("data-stage"));
    step.className = "timeline-step";
    if (sIdx === data.currentStage) {
      step.classList.add("active");
    } else if (sIdx < data.currentStage) {
      step.classList.add("completed");
    }
  });

  // 현재 단계 텍스트 변경
  const stageNames = {
    1: "1단계: 도입부 사건 파악 및 역할별 준비",
    2: "2단계: 기초 서면 확인 및 기조 진술",
    3: "3단계: 증거조사 및 이의제기 (핵심)",
    4: "4단계: 치열한 공방 및 재반박",
    5: "5단계: 최종 변론 및 구형",
    6: "6단계: 배심원 평결 및 최종 판결"
  };
  document.getElementById("teacher-current-stage-title").innerText = stageNames[data.currentStage];

  // 학생 명단 버킷 렌더링
  renderStudentBuckets(data.students);

  // 실시간 작성 모니터 렌더링 (프리라이더 방지 대시보드)
  renderTeacherMonitor(data);

  // 실시간 이의제기 팝업 처리
  handleObjectionTeacherPopup(data);
}

// 드래그 앤 드롭 기본 함수들
function allowDrop(ev) {
  ev.preventDefault();
}

function handleDragStart(ev, name) {
  ev.dataTransfer.setData("studentName", name);
}

function handleDrop(ev, team, role) {
  ev.preventDefault();
  const name = ev.dataTransfer.getData("studentName");
  if (name) {
    window.MockTrial.DB.assignStudentRole(sessionId, name, team, role);
  }
}

// 8. 대기실 학생 카드 및 교사 매칭 버킷 렌더링
function renderStudentBuckets(students) {
  const listUnassigned = document.getElementById("list-unassigned");
  const roleProsecutionSpeaker = document.getElementById("role-prosecution-speaker");
  const roleProsecutionAnalyst = document.getElementById("role-prosecution-analyst");
  const roleProsecutionStrategist = document.getElementById("role-prosecution-strategist");
  const roleProsecutionFinalist = document.getElementById("role-prosecution-finalist");
  
  const roleDefenseSpeaker = document.getElementById("role-defense-speaker");
  const roleDefenseGuard = document.getElementById("role-defense-guard");
  const roleDefenseArguer = document.getElementById("role-defense-arguer");
  const roleDefenseFinalist = document.getElementById("role-defense-finalist");
  
  const listJury = document.getElementById("list-jury");

  // 기존 내용 지우기
  listUnassigned.innerHTML = "";
  roleProsecutionSpeaker.innerHTML = "";
  roleProsecutionAnalyst.innerHTML = "";
  roleProsecutionStrategist.innerHTML = "";
  roleProsecutionFinalist.innerHTML = "";
  roleDefenseSpeaker.innerHTML = "";
  roleDefenseGuard.innerHTML = "";
  roleDefenseArguer.innerHTML = "";
  roleDefenseFinalist.innerHTML = "";
  listJury.innerHTML = "";

  let countUnassigned = 0;
  let countJury = 0;

  Object.values(students).forEach((student) => {
    // 배지 생성
    const badge = document.createElement("div");
    badge.className = `student-badge ${student.connected ? 'online' : 'offline'}`;
    badge.draggable = true;
    badge.ondragstart = (ev) => handleDragStart(ev, student.name);
    
    let roleText = "";
    if (student.role) {
      const roleMap = {
        speaker: "기조", analyst: "분석", guard: "감시",
        strategist: "반박", arguer: "논증", finalist: "최종", juror: "배심"
      };
      roleText = roleMap[student.role] || "";
    }
    
    badge.innerHTML = `👤 ${student.name} ${roleText ? `<span class="role-indicator">${roleText}</span>` : ""}`;

    // 해당 버킷에 담기
    if (!student.team) {
      listUnassigned.appendChild(badge);
      countUnassigned++;
    } else if (student.team === "prosecution") {
      if (student.role === "speaker") roleProsecutionSpeaker.appendChild(badge);
      else if (student.role === "analyst") roleProsecutionAnalyst.appendChild(badge);
      else if (student.role === "strategist") roleProsecutionStrategist.appendChild(badge);
      else if (student.role === "finalist") roleProsecutionFinalist.appendChild(badge);
    } else if (student.team === "defense") {
      if (student.role === "speaker") roleDefenseSpeaker.appendChild(badge);
      else if (student.role === "guard") roleDefenseGuard.appendChild(badge);
      else if (student.role === "arguer") roleDefenseArguer.appendChild(badge);
      else if (student.role === "finalist") roleDefenseFinalist.appendChild(badge);
    } else if (student.team === "jury") {
      listJury.appendChild(badge);
      countJury++;
    }
  });

  document.getElementById("count-unassigned").innerText = countUnassigned;
  document.getElementById("count-jury").innerText = countJury;
}

// 교사용 학생 일괄 자동 배정 (매우 유용!)
function autoAssignStudents() {
  if (!sessionData) return;
  const students = Object.values(sessionData.students);
  const unassigned = students.filter(s => !s.team);
  
  if (unassigned.length === 0) {
    alert("모든 학생이 이미 배정되었습니다.");
    return;
  }

  // 공격/방어 빈자리 탐색
  const roles = [
    { team: "prosecution", role: "speaker" },
    { team: "prosecution", role: "analyst" },
    { team: "prosecution", role: "strategist" },
    { team: "prosecution", role: "finalist" },
    { team: "defense", role: "speaker" },
    { team: "defense", role: "guard" },
    { team: "defense", role: "arguer" },
    { team: "defense", role: "finalist" }
  ];

  let uIdx = 0;
  
  // 먼저 빈 역할 구역을 채움
  roles.forEach((r) => {
    const isFilled = students.some(s => s.team === r.team && s.role === r.role);
    if (!isFilled && uIdx < unassigned.length) {
      window.MockTrial.DB.assignStudentRole(sessionId, unassigned[uIdx].name, r.team, r.role);
      uIdx++;
    }
  });

  // 남은 모든 인원은 배심원단으로 일괄 배정
  while (uIdx < unassigned.length) {
    window.MockTrial.DB.assignStudentRole(sessionId, unassigned[uIdx].name, "jury", "juror");
    uIdx++;
  }
}

// 9. 교사용 작성 현황 모니터링 (실시간 뷰어 - 프리라이더 추적용)
function renderTeacherMonitor(data) {
  const pMonitor = document.getElementById("teacher-monitor-prosecution");
  const dMonitor = document.getElementById("teacher-monitor-defense");
  
  const pData = data.prosecutionData;
  const dData = data.defenseData;

  // 검사 측
  pMonitor.innerHTML = `
    <div class="peer-preview-card" style="border-color: ${pData.isSpeakerDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">① 기조 대변인 ${pData.isSpeakerDone ? '✅ 완료' : '✍️ 작성 중'}</div>
      <div class="peer-status-text" style="color: ${pData.opening ? '#fff' : 'var(--text-muted)'}">
        ${pData.opening || '아직 개회 진술문이 입력되지 않았습니다.'}
      </div>
    </div>
    <div class="peer-preview-card" style="border-color: ${pData.isAnalystDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">② 증거 분석관 ${pData.isAnalystDone ? '✅ 완료' : '✍️ 작성 중'}</div>
      <div style="font-size:11px; margin-bottom: 5px;">제출된 증거: <b>${pData.selectedEvidence.join(", ") || '없음'}</b></div>
      <div class="peer-status-text" style="color: ${pData.argument ? '#fff' : 'var(--text-muted)'}">
        ${pData.argument || '아직 주논증서가 입력되지 않았습니다.'}
      </div>
    </div>
    <div class="peer-preview-card" style="border-color: ${pData.isStrategistDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">③ 반박 전략가 ${pData.isStrategistDone ? '✅ 완료' : '✍️ 작성 중'}</div>
      <div class="peer-status-text" style="color: ${pData.counterArgument ? '#fff' : 'var(--text-muted)'}">
        ${pData.counterArgument || '아직 재반박문이 입력되지 않았습니다.'}
      </div>
    </div>
    <div class="peer-preview-card" style="border-color: ${pData.isFinalistDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">④ 최종 변론가 ${pData.isFinalistDone ? '✅ 완료' : '✍️ 작성 중'}</div>
      <div class="peer-status-text" style="color: ${pData.finalStatement ? '#fff' : 'var(--text-muted)'}">
        ${pData.finalStatement || '아직 구형 요약이 입력되지 않았습니다.'}
      </div>
    </div>
  `;

  // 변호사 측
  dMonitor.innerHTML = `
    <div class="peer-preview-card" style="border-color: ${dData.isSpeakerDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">① 기조 답변인 ${dData.isSpeakerDone ? '✅ 완료' : '✍️ 작성 중'}</div>
      <div class="peer-status-text" style="color: ${dData.opening ? '#fff' : 'var(--text-muted)'}">
        ${dData.opening || '아직 답변서 요약이 입력되지 않았습니다.'}
      </div>
    </div>
    <div class="peer-preview-card" style="border-color: ${dData.isGuardDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">② 증거 감시관 ${dData.isGuardDone ? '✅ 완료' : '👀 감시 중'}</div>
      <div style="font-size:11px;">제기한 이의제기 횟수: <b>${dData.objections.length}회</b></div>
    </div>
    <div class="peer-preview-card" style="border-color: ${dData.isArguerDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">③ 방어 논증가 ${dData.isArguerDone ? '✅ 완료' : '✍️ 작성 중'}</div>
      <div style="font-size:11px; margin-bottom: 5px;">채택 방어증거: <b>${dData.selectedEvidence.join(", ") || '없음'}</b></div>
      <div class="peer-status-text" style="color: ${dData.argument ? '#fff' : 'var(--text-muted)'}">
        ${dData.argument || '아직 무죄 주논증서가 입력되지 않았습니다.'}
      </div>
    </div>
    <div class="peer-preview-card" style="border-color: ${dData.isFinalistDone ? 'var(--color-jury)' : 'var(--glass-border)'}">
      <div class="peer-role-title">④ 최종 변론가 ${dData.isFinalistDone ? '✅ 완료' : '✍️ 작성 중'}</div>
      <div class="peer-status-text" style="color: ${dData.finalStatement ? '#fff' : 'var(--text-muted)'}">
        ${dData.finalStatement || '아직 최종 변론문이 입력되지 않았습니다.'}
      </div>
    </div>
  `;
}

// 10. 학생용 대시보드 UI 업데이트
function updateStudentDashboard(data) {
  document.getElementById("student-session-code-val").innerText = data.sessionId;
  
  // 내 역할 배지 라벨 갱신
  const teamLabel = myTeam === "prosecution" ? "검사 측" : myTeam === "defense" ? "변호인 측" : "배심원단";
  const roleLabelMap = {
    speaker: myTeam === "prosecution" ? "기조 대변인" : "기조 답변인",
    analyst: "증거 분석관",
    guard: "증거 감시관",
    strategist: "반박 전략가",
    arguer: "방어 논증가",
    finalist: "최종 변론가",
    juror: "배심원"
  };
  document.getElementById("student-role-indicator-badge").innerText = `${teamLabel} - ${roleLabelMap[myRole]} (${myName})`;

  // 타이머 렌더링
  const mins = Math.floor(data.timer.timeLeft / 60).toString().padStart(2, "0");
  const secs = (data.timer.timeLeft % 60).toString().padStart(2, "0");
  const timerDisplay = document.getElementById("trial-timer-val");
  timerDisplay.innerText = `${mins}:${secs}`;
  if (data.timer.timeLeft < 60) {
    timerDisplay.classList.add("warning");
  } else {
    timerDisplay.classList.remove("warning");
  }

  // 좌측 단계 라벨
  const stageLabels = {
    1: "1단계: 도입부 사건 파악 및 역할별 준비",
    2: "2단계: 기초 서면 & 기조 진술",
    3: "3단계: 증거 조사 & 이의제기",
    4: "4단계: 치열한 공방 & 재반박",
    5: "5단계: 최종 변론 & 구형",
    6: "6단계: 배심원 평결 & 최종 판결"
  };
  document.getElementById("trial-stage-label").innerText = stageLabels[data.currentStage];

  // 배심원 실시간 입력창 제어
  const jurorChat = document.getElementById("juror-chat-panel");
  if (myRole === "juror" && data.currentStage < 6) {
    jurorChat.style.display = "block";
  } else {
    jurorChat.style.display = "none";
  }

  // 공통 피드 렌더링
  renderFeedLogs(data.feed);

  // 중앙 워크스페이스 단계별 역할별 폼 렌더링
  renderStudentWorkspace(data);
}

// 실시간 피드 로그 출력
function renderFeedLogs(feed) {
  const feedBox = document.getElementById("trial-feed-box");
  const isAtBottom = feedBox.scrollHeight - feedBox.clientHeight <= feedBox.scrollTop + 50;

  feedBox.innerHTML = "";
  feed.forEach((item) => {
    const fItem = document.createElement("div");
    fItem.className = `feed-item ${item.type || 'chat'}`;
    fItem.innerHTML = `<span class="feed-sender">${item.sender}</span>${item.text}`;
    feedBox.appendChild(fItem);
  });

  // 스크롤 아래 자동 정렬
  if (isAtBottom) {
    feedBox.scrollTop = feedBox.scrollHeight;
  }
}

// 배심원 실시간 한 줄 논평 송출
function submitJurorOpinion(event) {
  event.preventDefault();
  const input = document.getElementById("juror-chat-input");
  const text = input.value.trim();
  if (!text) return;

  window.MockTrial.DB.sendFeedMessage(sessionId, `배심원 [${myName}]`, text, "jury");
  input.value = "";
}

// ----------------------------------------------------
// ① 비주얼 노벨 모듈 연출
// ----------------------------------------------------
function startVisualNovel() {
  vnCurrentStep = 0;
  document.getElementById("vn-modal").style.display = "flex";
  renderVNStep();
}

function renderVNStep() {
  const scenarioId = (sessionData && sessionData.scenarioId) || "cyber-defamation";
  const script = window.MockTrial.scenarios[scenarioId].vnScript[vnCurrentStep];
  const labelName = document.getElementById("vn-char-name-label");
  const labelDialogue = document.getElementById("vn-dialogue-label");
  const bgView = document.getElementById("vn-bg-view");
  const avatarLeft = document.getElementById("vn-char-left");
  const avatarRight = document.getElementById("vn-char-right");

  labelName.innerText = script.character;
  labelDialogue.innerText = script.dialogue;
  
  // 배경색/테마 모사
  if (script.bg === "school-gate") bgView.style.backgroundColor = "#1e293b";
  else if (script.bg === "classroom-stress") bgView.style.backgroundColor = "#2d1b1b";
  else if (script.bg === "police-room") bgView.style.backgroundColor = "#1b253b";
  else if (script.bg === "classroom-normal") bgView.style.backgroundColor = "#1b2d28";
  else bgView.style.backgroundColor = "#161b26";

  // 아바타 액티브 상태 연출
  if (script.side === "left") {
    avatarLeft.classList.remove("inactive");
    avatarLeft.innerText = script.avatar;
    avatarRight.classList.add("inactive");
  } else if (script.side === "right") {
    avatarRight.classList.remove("inactive");
    avatarRight.innerText = script.avatar;
    avatarLeft.classList.add("inactive");
  } else {
    avatarLeft.classList.add("inactive");
    avatarRight.classList.add("inactive");
  }
}

function vnNextStep() {
  const scenarioId = (sessionData && sessionData.scenarioId) || "cyber-defamation";
  const stepsCount = window.MockTrial.scenarios[scenarioId].vnScript.length;
  if (vnCurrentStep < stepsCount - 1) {
    vnCurrentStep++;
    renderVNStep();
  } else {
    // 비주얼 노벨 종료
    document.getElementById("vn-modal").style.display = "none";
    // 안내 팝업 자동 띄우기
    showRoleGuidelinePopup();
  }
}

// ----------------------------------------------------
// ② 가이드라인 팝업 모듈
// ----------------------------------------------------
function showRoleGuidelinePopup() {
  const modal = document.getElementById("guideline-modal");
  const title = document.getElementById("guideline-title");
  const content = document.getElementById("guideline-content");

  let guidelineData = null;
  const scenarioId = (sessionData && sessionData.scenarioId) || "cyber-defamation";
  const guidelines = window.MockTrial.scenarios[scenarioId].guidelines;

  if (myTeam === "prosecution") {
    guidelineData = guidelines.prosecutor;
  } else if (myTeam === "defense") {
    guidelineData = guidelines.defense;
  } else if (myTeam === "jury") {
    guidelineData = guidelines.juror;
  }

  if (guidelineData) {
    title.innerHTML = `⚖️ ${guidelineData.title}`;
    content.innerHTML = guidelineData.content;
    modal.style.display = "flex";
  }
}

function closeGuidelineModal() {
  document.getElementById("guideline-modal").style.display = "none";
}

// ----------------------------------------------------
// AI 피드백 및 대기실 탈출 및 시나리오 개설 추가 모듈
// ----------------------------------------------------
function closeAiFeedbackModal() {
  document.getElementById("ai-feedback-modal").style.display = "none";
}

function closeScenarioSelectModal() {
  document.getElementById("scenario-select-modal").style.display = "none";
}

function selectAndStartSession(scenarioId) {
  closeScenarioSelectModal();
  
  // 세션 개설
  sessionId = window.MockTrial.DB.createSession(scenarioId);
  myName = "교사 (재판장)";
  myRole = "teacher";
  myTeam = "teacher";
  userType = "teacher";

  showScreen("teacher-screen");
  
  // 실시간 동기화 바인딩
  window.MockTrial.DB.onSessionUpdate(sessionId, (data) => {
    sessionData = data;
    updateTeacherDashboard(data);
  });

  // 교사 전용 1초 주기 타이머 작동 (로컬 동기화용)
  startTeacherTimerLoop();
}

function leaveWaitingRoom() {
  if (confirm("대기실/법정에서 퇴장하여 로그인 화면으로 돌아가시겠습니까?")) {
    // 튕김 방지 정보 삭제 (자동 재접속 제거)
    localStorage.removeItem("reconnect_session_id");
    localStorage.removeItem("reconnect_student_name");
    sessionStorage.removeItem("reconnect_session_id");
    sessionStorage.removeItem("reconnect_student_name");
    
    // 데이터베이스 접속 끊기 처리
    if (sessionId && myName) {
      window.MockTrial.DB.disconnectStudent(sessionId, myName);
    }
    
    // 상태 초기화
    sessionId = null;
    myName = "";
    myRole = "";
    myTeam = "";
    
    // 메인 로그인 화면으로 리다이렉트
    showScreen("login-screen");
  }
}

function requestAiFeedback(roleKey) {
  const modal = document.getElementById("ai-feedback-modal");
  const content = document.getElementById("ai-feedback-content");
  
  let text = "";
  let evidence = [];
  let roleName = "";
  const scenarioId = (sessionData && sessionData.scenarioId) || "cyber-defamation";
  const scenario = window.MockTrial.scenarios[scenarioId];
  
  if (roleKey === "prosecution-strategy" || roleKey === "defense-strategy") {
    const input = document.getElementById("team-strategy-input");
    text = input ? input.value.trim() : "";
    roleName = roleKey === "prosecution-strategy" ? "공격(검사) 모둠 공동 전략" : "방어(변호인) 모둠 공동 전략";
  } else if (roleKey === "prosecution-speaker") {
    const input = document.getElementById("p-opening-input");
    text = input ? input.value.trim() : "";
    roleName = "검사 측 기조 대변인";
  } else if (roleKey === "prosecution-analyst") {
    const input = document.getElementById("p-arg-input");
    text = input ? input.value.trim() : "";
    evidence = sessionData.prosecutionData.selectedEvidence;
    roleName = "검사 측 증거 분석관";
  } else if (roleKey === "prosecution-strategist") {
    const input = document.getElementById("p-counter-input");
    text = input ? input.value.trim() : "";
    roleName = "검사 측 반박 전략가";
  } else if (roleKey === "prosecution-finalist") {
    const input = document.getElementById("p-final-input");
    text = input ? input.value.trim() : "";
    roleName = "검사 측 최종 변론가";
  } else if (roleKey === "defense-speaker") {
    const input = document.getElementById("d-opening-input");
    text = input ? input.value.trim() : "";
    roleName = "변호인 측 기조 답변인";
  } else if (roleKey === "defense-arguer") {
    const input = document.getElementById("d-arg-input");
    text = input ? input.value.trim() : "";
    evidence = sessionData.defenseData.selectedEvidence;
    roleName = "변호인 측 방어 논증가";
  } else if (roleKey === "defense-finalist") {
    const input = document.getElementById("d-final-input");
    text = input ? input.value.trim() : "";
    roleName = "변호인 측 최종 변론가";
  }

  if (!text || text.length < 15) {
    content.innerHTML = `
      <div style="text-align: center; padding: 20px 0;">
        <span style="font-size: 3rem;">⚠️</span>
        <h3 style="color: var(--color-defense); margin-top: 15px;">작성된 내용이 너무 적습니다!</h3>
        <p style="color: var(--text-muted); margin-top: 10px; font-size:13px; line-height: 1.5;">
          AI 피드백을 받으려면 법리적 주장을 최소 15자 이상 작성해 주세요.<br>
          (현재 글자 수: ${text ? text.length : 0}자)
        </p>
      </div>
    `;
    modal.style.display = "flex";
    return;
  }

  // AI Feedback Engine (Rule-based educational parser)
  let score = 50;
  let scoreColor = "var(--color-defense)";
  let strengths = [];
  let improvements = [];
  let suggestions = "";
  
  const hasKeyword = (k) => text.includes(k);
  const keywordsMatchCount = (arr) => arr.filter(k => text.includes(k)).length;

  if (roleKey === "prosecution-strategy" || roleKey === "prosecution-speaker") {
    const isCriminal = scenario.type === "criminal";
    let keywords = isCriminal ? ["명예훼손", "공연성", "특정성", "유포", "영장"] : ["소음", "데시벨", "손해", "치료비", "도청", "계약"];
    const matchCount = keywordsMatchCount(keywords);
    score = 60 + matchCount * 6;
    if (score > 100) score = 100;
    
    if (matchCount >= 3) {
      strengths.push("사건의 성격에 적합한 주요 법적 쟁점을 다수 짚어냈습니다.");
    } else {
      improvements.push("사건 성립 요건(예: " + keywords.slice(0, 3).join(", ") + ")을 더 적극적으로 단어에 반영해 논리를 구성해 보세요.");
    }
    
    if (hasKeyword("E2") || hasKeyword("일기장") || hasKeyword("도청기") || hasKeyword("E4")) {
      improvements.push("경고: E2/E4와 같이 절차적으로 불법 수집된 증거에 지나치게 의존하면 상대방의 이의제기로 증거가 배제될 수 있습니다. 적법 증거(E1, E3, E5) 위주로 전술을 수립하십시오.");
    } else {
      strengths.push("위법수집증거에 의존하지 않고 확실한 적법 증거 위주로 논리를 탄탄히 세우고 있습니다.");
    }
    
    suggestions = isCriminal 
      ? "피고인의 혐의를 뒷받침할 수 있도록 법적 영장에 의해 획득된 IP 로그(E3)와 동료 목격 진술(E5)을 유죄 입증의 핵심 근거로 내세우세요." 
      : "원고의 실제 손해액(진단서 E5, 계약서 E1)과 공인 측정 데이터(E3)를 결합하여 피고의 과실 및 책임을 강력히 요구해 보세요.";
  }
  else if (roleKey === "prosecution-analyst") {
    const hasIllegalEv = evidence.includes("E2") || evidence.includes("E4") || evidence.includes("E6");
    score = 65 + (evidence.includes("E3") ? 15 : 0) + (evidence.includes("E1") ? 10 : 0) - (hasIllegalEv ? 25 : 0);
    if (score < 40) score = 40;
    if (score > 100) score = 100;
    
    if (hasIllegalEv) {
      improvements.push("<b>경고:</b> 영장이 없거나(E2), 불법 도청 녹음(E4), 협박 자백(E6) 등 절차상 위법하게 수집된 증거를 제출 대상으로 채택했습니다. 이의제기에 취약하므로 제외할 것을 권장합니다.");
    } else {
      strengths.push("헌법상 적법절차 원칙에 저촉되지 않는 무결한 적법 증거(E1, E3, E5) 위주로 깔끔하게 선별했습니다.");
    }
    
    if (evidence.includes("E3")) {
      strengths.push("공식 법원 절차 및 영장(E3)을 통해 수집한 데이터를 중심에 두어 논증의 법리 신뢰도를 대폭 높였습니다.");
    }
    
    suggestions = "이의제기를 완벽히 피해갈 수 있는 E1과 E3를 주축으로 삼아 피고인의 범죄 행위를 탄탄히 논박하십시오.";
  }
  else if (roleKey === "prosecution-strategist") {
    score = 60 + keywordsMatchCount(["알리바이", "탄핵", "도용", "공유기", "해킹", "신빙성"]) * 7;
    if (score > 100) score = 100;
    
    if (hasKeyword("공유기") || hasKeyword("도용") || hasKeyword("해킹")) {
      strengths.push("상대방 피고인이 주장할 공유기 고장 알리바이(E7)나 기기 도용 주장(E8)의 허점을 지적하고 인과관계를 차단했습니다.");
    } else {
      improvements.push("상대 피고인의 '스마트폰 도용 및 해킹 주장'이나 '공유기 작동 불능 알리바이'에 대해, 범행 시간에 모바일 네트워크 접속이 충분히 가능했음을 지적하는 반박을 추가하세요.");
    }
    
    suggestions = "상대의 공유기 고장이나 기기 분실 도용 주장이 법원 회신 공문(E3) 및 목격자 진술(E5) 등 신뢰도 높은 적법물증을 무력화할 수 없다는 논리로 탄핵해 보세요.";
  }
  else if (roleKey === "prosecution-finalist") {
    score = 70 + keywordsMatchCount(["유죄", "배상", "엄벌", "고통", "배심원", "정의"]) * 5;
    if (score > 100) score = 100;
    
    if (hasKeyword("고통") || hasKeyword("피해") || hasKeyword("정의")) {
      strengths.push("이번 소송/피해 행위가 일상생활과 권리를 얼마나 무참히 짓밟았는지 배심원단에게 감성적이면서도 법리적으로 잘 호소했습니다.");
    }
    suggestions = "존경하는 배심원 여러분을 호명하며, 불법 행위에 상응하는 유죄 평결(또는 배상액 청구 인용)을 내려 사회 정의를 세워줄 것을 요청하세요.";
  }
  else if (roleKey === "defense-strategy" || roleKey === "defense-speaker") {
    const isCriminal = scenario.type === "criminal";
    let keywords = isCriminal ? ["무죄", "영장주의", "위법수집", "독수독과", "부인", "배제"] : ["기각", "사생활", "침해", "과실", "매트", "알리바이"];
    const matchCount = keywordsMatchCount(keywords);
    score = 60 + matchCount * 6;
    if (score > 100) score = 100;
    
    if (hasKeyword("위법") || hasKeyword("도청") || hasKeyword("배제")) {
      strengths.push("상대방 증거의 절차적 하자 및 불법성(사생활 무단 도청, 영장 없는 수색 등)을 효과적으로 부각했습니다.");
    } else {
      improvements.push("상대가 제출할 E2, E4 등의 증거들이 헌법상 사생활 자유 및 절차적 한계를 일탈한 위법 증거임을 기조 단계부터 명확히 선포해 기선을 제압하십시오.");
    }
    
    suggestions = "검찰(원고) 측의 기소 내용이 절차상 하자가 있는 불법 증거들로 채워져 있어 실체적 진실을 입증할 증거능력이 없음을 힘주어 답변서에 기록하세요.";
  }
  else if (roleKey === "defense-arguer") {
    const hasLegalEv = evidence.includes("E7") || evidence.includes("E8");
    const hasIllegalEv = evidence.includes("E2") || evidence.includes("E4") || evidence.includes("E6");
    score = 65 + (hasLegalEv ? 25 : 0) - (hasIllegalEv ? 15 : 0);
    if (score < 40) score = 40;
    if (score > 100) score = 100;
    
    if (evidence.includes("E7")) {
      strengths.push("공유기 수리서/출장확인서(E7)를 제출하여 사건 발생 당시 피고가 기기를 다룰 수 없었거나 현장에 없었음을 완벽히 수립했습니다.");
    }
    if (evidence.includes("E8")) {
      strengths.push("분실물 신고서 및 지문 확인 기록(E8)을 통해 제3자의 기기 도용 및 계정 해킹 가능성을 과학적으로 잘 피력했습니다.");
    }
    
    if (!hasLegalEv) {
      improvements.push("방어논증을 탄탄히 다지기 위해서, 피고인에게 주어진 합법적 알리바이 물증인 E7과 E8을 모두 선택하고 이를 해설하는 데 집중하세요.");
    }
    
    suggestions = "E7(기기 미사용/부재 증명)과 E8(기기 도용/분실 신고)이 어떻게 피고인의 혐의를 100% 탄핵하는지 설명해 배심원의 합리적 의심을 유도하십시오.";
  }
  else if (roleKey === "defense-finalist") {
    score = 65 + keywordsMatchCount(["배심원", "무죄", "기각", "독수독과", "합리적 의심", "영장주의"]) * 6;
    if (score > 100) score = 100;
    
    if (hasKeyword("독수독과") || hasKeyword("배제") || hasKeyword("위법수집")) {
      strengths.push("위법하게 수집된 증거는 사법 신뢰를 위해 법정에서 완전히 퇴출해야 한다는 원칙(독수독과)을 배심원단에게 가장 인상 깊게 심어 주었습니다.");
    } else {
      improvements.push("상대의 불법 압수/도청 증거에 대해 '독나무에서 열린 열매는 원천적으로 독이 있다'는 독수독과(毒樹毒果) 원칙을 활용해 변론의 무게감을 실어 보세요.");
    }
    
    suggestions = "헌법이 수사기관(원고)의 사적 욕망보다 절차적 한계를 더 무겁게 본 이유를 짚고, 합리적 의심이 해결되지 않은 피고인에게 공명정대하게 무죄(또는 청구기각)를 평결해 줄 것을 간곡히 대변하십시오.";
  }

  if (score >= 80) scoreColor = "var(--color-jury)";
  else if (score >= 60) scoreColor = "var(--accent-blue-mid)";
  
  let strengthsHTML = strengths.map(s => `<li style="margin-bottom: 6px;">🟢 ${s}</li>`).join("");
  let improvementsHTML = improvements.map(i => `<li style="margin-bottom: 6px;">🟡 ${i}</li>`).join("");
  
  if (!strengthsHTML) strengthsHTML = `<li> white; 내용 분석 중... 법리 요건을 더 포함해 보세요.</li>`;
  if (!improvementsHTML) improvementsHTML = `<li>🟢 특별한 감점 요인이 없습니다. 잘하셨습니다!</li>`;

  content.innerHTML = `
    <div style="background: rgba(0,0,0,0.15); padding: 15px; border-radius: 8px; border: 1px solid var(--glass-border); display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
      <div>
        <h4 style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">분석 대상 역할</h4>
        <span style="font-size: 15px; font-weight: bold; color: #fff;">${roleName}</span>
      </div>
      <div style="text-align: right;">
        <h4 style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">AI 법리 평가 점수</h4>
        <span style="font-size: 24px; font-weight: 900; color: ${scoreColor}; font-family:'Outfit';">${score} / 100</span>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 13.5px; color: var(--color-jury); font-weight: bold; margin-bottom: 8px; display:flex; align-items:center; gap:6px;">👍 AI 법정 분석관이 꼽은 잘한 점</h4>
      <ul style="font-size: 12.5px; line-height: 1.5; padding-left: 20px; color: var(--text-main);">
        ${strengthsHTML}
      </ul>
    </div>

    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 13.5px; color: var(--accent-gold-light); font-weight: bold; margin-bottom: 8px; display:flex; align-items:center; gap:6px;">💡 보완하면 좋을 법리적 관점 및 체크포인트</h4>
      <ul style="font-size: 12.5px; line-height: 1.5; padding-left: 20px; color: var(--text-main);">
        ${improvementsHTML}
      </ul>
    </div>

    <div style="background: rgba(37,99,235,0.04); border: 1px solid rgba(37,99,235,0.15); padding: 15px; border-radius: 8px;">
      <h4 style="font-size: 13px; color: var(--accent-blue-mid); font-weight: bold; margin-bottom: 6px; display:flex; align-items:center; gap:6px;">💡 작성 꿀팁 & 추천 가이드라인</h4>
      <p style="font-size: 12px; line-height: 1.5; color: var(--text-muted); margin: 0;">
        ${suggestions}
      </p>
    </div>
  `;

  modal.style.display = "flex";
}

// ----------------------------------------------------
// ③ 미니 법전 슬라이딩 패널 컨트롤
// ----------------------------------------------------
function toggleLawbook() {
  const panel = document.getElementById("lawbook-panel");
  panel.classList.toggle("open");
}

// ----------------------------------------------------
// ④ 모둠 협업 잠금 및 실시간 피어 공유 뷰어 & 워크스페이스
// ----------------------------------------------------
function renderStudentWorkspace(data) {
  const workspace = document.getElementById("trial-workspace");
  const currentStage = data.currentStage;
  
  // 기본 협업 피어 뷰어 마크업 (팀원 작성 현황 공유)
  const peerPrevs = myTeam !== "jury" ? generatePeerPrevs(data) : "";

  // 1단계: 도입부 사건 파악 및 역할별 준비 단계
  if (currentStage === 1) {
    renderStage1Workspace(workspace, data);
    return;
  }

  // 6단계: 배심원 평결 및 최종 판결 결과 화면
  if (currentStage === 6) {
    renderStage6Workspace(workspace, data);
    return;
  }

  // 공격 모둠 (검사 측) 워크스페이스 렌더링
  if (myTeam === "prosecution") {
    renderProsecutionWorkspace(workspace, data, peerPrevs);
  } 
  // 방어 모둠 (변호인 측) 워크스페이스 렌더링
  else if (myTeam === "defense") {
    renderDefenseWorkspace(workspace, data, peerPrevs);
  }
  // 배심원 워크스페이스 렌더링
  else if (myTeam === "jury") {
    renderJuryWorkspace(workspace, data);
  }
}

// 피어 실시간 뷰어 바 생성
function generatePeerPrevs(data) {
  const teamData = myTeam === "prosecution" ? data.prosecutionData : data.defenseData;
  const isProsecution = myTeam === "prosecution";
  
  let cards = "";
  if (isProsecution) {
    cards = `
      <div class="peer-preview-card">
        <div class="peer-role-title">① 대변인 (기조): ${teamData.isSpeakerDone ? '✅완료' : '✍️작성중'}</div>
        <div class="peer-status-text">${teamData.opening || '대기 중...'}</div>
      </div>
      <div class="peer-preview-card">
        <div class="peer-role-title">② 분석관 (증거): ${teamData.isAnalystDone ? '✅완료' : '✍️작성중'}</div>
        <div class="peer-status-text">${teamData.argument ? `[채택증거 제출완료] ${teamData.argument}` : '대기 중...'}</div>
      </div>
      <div class="peer-preview-card">
        <div class="peer-role-title">③ 전략가 (반박): ${teamData.isStrategistDone ? '✅완료' : '✍️작성중'}</div>
        <div class="peer-status-text">${teamData.counterArgument || '대기 중...'}</div>
      </div>
    `;
  } else {
    cards = `
      <div class="peer-preview-card">
        <div class="peer-role-title">① 답변인 (기조): ${teamData.isSpeakerDone ? '✅완료' : '✍️작성중'}</div>
        <div class="peer-status-text">${teamData.opening || '대기 중...'}</div>
      </div>
      <div class="peer-preview-card">
        <div class="peer-role-title">② 감시관 (이의): ${teamData.isGuardDone ? '✅완료' : '👀감시중'}</div>
        <div class="peer-status-text">이의제기 횟수: ${teamData.objections.length}회</div>
      </div>
      <div class="peer-preview-card">
        <div class="peer-role-title">③ 논증가 (적법): ${teamData.isArguerDone ? '✅완료' : '✍️작성중'}</div>
        <div class="peer-status-text">${teamData.argument ? `[방어논증 제출완료] ${teamData.argument}` : '대기 중...'}</div>
      </div>
    `;
  }

  return `
    <div class="peer-viewer-bar">
      <h4>👥 우리 모둠 실시간 작성 현황 (서로 피드백 가능)</h4>
      <div class="peer-grid">${cards}</div>
    </div>
  `;
}

// ----------------------------------------------------
// 검사 측 워크스페이스
// ----------------------------------------------------
// 실시간 소송 변론서 합치기 및 다듬기 헬퍼 함수
function generateCombinedBriefHTML(data) {
  const isProsecution = myTeam === "prosecution";
  const teamData = isProsecution ? data.prosecutionData : data.defenseData;
  const teamName = isProsecution ? "검사(공격) 측 소송 준비서면" : "변호인(방어) 측 답변 및 준비서면";
  const colorVar = isProsecution ? "var(--color-prosecution)" : "var(--color-defense)";

  let briefHTML = `
    <div class="glass-card" style="margin-top: 30px; border-top: 3px solid ${colorVar}; background: rgba(255,255,255,0.95); box-shadow: 0 8px 30px rgba(0,0,0,0.04);">
      <h3 style="color: ${colorVar}; font-size: 14.5px; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; font-weight: bold;">
        ⚖️ 실시간 모둠 변론서 통합 미리보기 (다듬기용)
      </h3>
      <p style="font-size: 11.5px; color: var(--text-muted); margin-bottom: 15px;">
        우리 모둠 구성원들이 각자 입력 중인 서면 조각들이 실시간으로 결합되어 하나의 소송 문서로 빌드됩니다. 문맥이 매끄러운지 상호 조율해 보세요.
      </p>
      
      <div class="combined-brief-body" style="font-family: 'Noto Sans KR', sans-serif; font-size: 12.5px; line-height: 1.7; color: var(--text-main); background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid var(--glass-border); max-height: 350px; overflow-y: auto;">
        <div style="font-weight: 900; font-size: 15px; text-align: center; margin-bottom: 15px; border-bottom: 2px solid ${colorVar}; padding-bottom: 8px; letter-spacing: 0.1em; color: ${colorVar};">
          ${teamName}
        </div>
  `;

  if (isProsecution) {
    briefHTML += `
        <div style="margin-bottom: 15px;">
          <h4 style="font-weight: bold; color: ${colorVar}; margin-bottom: 4px; font-size: 13px;">1. 공소 요지 및 기조 진술</h4>
          <div style="white-space: pre-wrap; background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; min-height: 40px;">${teamData.opening || '기조 대변인이 작성 중입니다...'}</div>
        </div>
        <div style="margin-bottom: 15px;">
          <h4 style="font-weight: bold; color: ${colorVar}; margin-bottom: 4px; font-size: 13px;">2. 적법 증거 요지 및 유죄 주논증</h4>
          <p style="font-size: 11px; color: var(--accent-blue-mid); margin-bottom: 4px; font-weight: bold;">제출된 적법 증거: [${teamData.selectedEvidence.join(", ") || '없음'}]</p>
          <div style="white-space: pre-wrap; background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; min-height: 40px;">${teamData.argument || '증거 분석관이 작성 중입니다...'}</div>
        </div>
        <div style="margin-bottom: 15px;">
          <h4 style="font-weight: bold; color: ${colorVar}; margin-bottom: 4px; font-size: 13px;">3. 피고인 알리바이에 대한 반박</h4>
          <div style="white-space: pre-wrap; background: #fff; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; min-height: 40px;">${teamData.counterArgument || '반박 전략가가 작성 중입니다...'}</div>
        </div>
         // 1. 기조 대변인
  if (myRole === "speaker") {
    const isLocked = currentStage < 2;
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>2단계 [기초 서면 확인 및 기조 진술]</b> 단계로 진행해야 해제됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <h3 class="mb-10">① 기조 대변인 임무: 공소 제기 및 최초 변론 작성</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          사건 요약 및 피고인 강지민의 정보통신망법 위반(명예훼손) 공소내용을 요약하여 양측 기조 진술 단계에서 발표할 서면을 작성하세요.
        </p>
        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">기조 진술서 작성란</label>
            <div style="display: flex; gap: 8px;">
              <button type="button" onclick="requestAiFeedback('prosecution-speaker')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: linear-gradient(135deg, #10b981, #047857); color: white; border-color: #059669; box-shadow: 0 2px 5px rgba(16,185,129,0.15); border-radius: 6px; cursor:pointer;">🤖 AI 피드백 받기</button>
              <button type="button" onclick="showExampleGuide('prosecution-speaker')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
            </div>
          </div>
          <textarea id="p-opening-input" rows="7" placeholder="여기에 피고인의 죄목과 기조 변론 요지를 작성해 주세요..." oninput="updateLiveText('prosecution', 'opening', this.value)" ${isLocked ? 'disabled' : ''}>${pData.opening}</textarea>
        </div>
        <div class="flex-row-between">
          <span style="font-size: 11.5px; color: var(--accent-blue-mid);">💡 모둠원들과 의견을 나누며 기조 진술을 작성하세요. 완료 시 내 역할 완료를 누릅니다.</span>
          <button onclick="completeRoleTask('prosecution', 'isSpeakerDone')" class="primary" ${pData.isSpeakerDone ? 'disabled' : ''}>
            ${pData.isSpeakerDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;
  }
  // 2. 증거 분석관
  else if (myRole === "analyst") {
    const isLocked = currentStage < 3; // 단계별 잠금 해제
    
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>3단계 [증거 조사 및 이의제기]</b>로 진입해야 활성화됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <h3 class="mb-10">② 증거 분석관 임무: 적법 증거 채택 및 주논증 작성</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          증거 마켓에서 증거 카드를 클릭하여 내용을 읽고, <b>'적법 절차'</b>를 위반하지 않은 적법 증거만을 법정에 제출하세요.
          동시에 제출할 증거가 피고인의 범죄 사실을 어떻게 명확히 입증하는지 주논증서를 상세히 기술하십시오.
        </p>
        
        <h4 class="evidence-market-title">🛒 모의재판 증거 마켓 (사이버 명예훼손 시나리오)</h4>
        <div class="evidence-grid" id="evidence-market-list">
          <!-- 증거 목록 동적 생성 -->
        </div>
 
        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">공소사실 주논증 작성란 (제출된 증거에 대한 법적 의미 기술)</label>
            <div style="display: flex; gap: 8px;">
              <button type="button" onclick="requestAiFeedback('prosecution-analyst')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: linear-gradient(135deg, #10b981, #047857); color: white; border-color: #059669; box-shadow: 0 2px 5px rgba(16,185,129,0.15); border-radius: 6px; cursor:pointer;">🤖 AI 피드백 받기</button>
              <button type="button" onclick="showExampleGuide('prosecution-analyst')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
            </div>
          </div>
          <textarea id="p-arg-input" rows="5" placeholder="선택한 적법 증거(예: E1, E3 등)들이 왜 유죄를 입증하는지 핵심 논증을 기록하세요..." oninput="updateLiveText('prosecution', 'argument', this.value)" ${pData.isAnalystDone ? 'disabled' : ''}>${pData.argument}</textarea>
        </div>
        </div>
    `;
  }

  briefHTML += `
      </div>
    </div>
  `;
  return briefHTML;
}

function renderProsecutionWorkspace(workspace, data, peerPrevs) {
  const pData = data.prosecutionData;
  const currentStage = data.currentStage;
  
  workspace.innerHTML = `
    <div class="workspace-header">
      <h2>공격 모둠 (검사 측) 워크스페이스</h2>
      <span style="background: var(--color-prosecution); color: #fff;">검사</span>
    </div>
    ${peerPrevs}
    <div class="lock-overlay-container" id="role-panel-container">
      <!-- 동적 역할 폼 바인딩 -->
    </div>
    ${generateCombinedBriefHTML(data)}
  `;

  const container = document.getElementById("role-panel-container");

  // 1. 기조 대변인
  if (myRole === "speaker") {
    const isLocked = false;
    container.innerHTML = `
      <div class="glass-card">
        <h3 class="mb-10">① 기조 대변인 임무: 공소 제기 및 최초 변론 작성</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          사건 요약 및 피고인 강지민의 정보통신망법 위반(명예훼손) 공소내용을 요약하여 양측 기조 진술 단계에서 발표할 서면을 작성하세요.
        </p>
        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">기조 진술서 작성란</label>
            <button type="button" onclick="showExampleGuide('prosecution-speaker')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
          </div>
          <textarea id="p-opening-input" rows="7" placeholder="여기에 피고인의 죄목과 기조 변론 요지를 작성해 주세요..." oninput="updateLiveText('prosecution', 'opening', this.value)" ${isLocked ? 'disabled' : ''}>${pData.opening}</textarea>
        </div>
        <div class="flex-row-between">
          <span style="font-size: 11.5px; color: var(--accent-blue-mid);">💡 모둠원들과 의견을 나누며 기조 진술을 작성하세요. 완료 시 내 역할 완료를 누릅니다.</span>
          <button onclick="completeRoleTask('prosecution', 'isSpeakerDone')" class="primary" ${pData.isSpeakerDone ? 'disabled' : ''}>
            ${pData.isSpeakerDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;
  }
  // 2. 증거 분석관
  else if (myRole === "analyst") {
    const isLocked = false; // 단계별 잠금 해제
    
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>3단계 [증거 조사 및 이의제기]</b>로 진입해야 활성화됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <h3 class="mb-10">② 증거 분석관 임무: 적법 증거 채택 및 주논증 작성</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          증거 마켓에서 증거 카드를 클릭하여 내용을 읽고, <b>'적법 절차'</b>를 위반하지 않은 적법 증거만을 법정에 제출하세요.
          동시에 제출할 증거가 피고인의 범죄 사실을 어떻게 명확히 입증하는지 주논증서를 상세히 기술하십시오.
        </p>
        
        <h4 class="evidence-market-title">🛒 모의재판 증거 마켓 (사이버 명예훼손 시나리오)</h4>
        <div class="evidence-grid" id="evidence-market-list">
          <!-- 증거 목록 동적 생성 -->
        </div>

        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">공소사실 주논증 작성란 (제출된 증거에 대한 법적 의미 기술)</label>
            <button type="button" onclick="showExampleGuide('prosecution-analyst')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
          </div>
          <textarea id="p-arg-input" rows="5" placeholder="선택한 적법 증거(예: E1, E3 등)들이 왜 유죄를 입증하는지 핵심 논증을 기록하세요..." oninput="updateLiveText('prosecution', 'argument', this.value)" ${pData.isAnalystDone ? 'disabled' : ''}>${pData.argument}</textarea>
        </div>

        <div class="flex-row-between">
          <span style="font-size: 11.5px; color: var(--accent-gold);">제출된 적법 증거: <b id="selected-p-evids-badge">${pData.selectedEvidence.join(", ") || '없음'}</b></span>
          <button onclick="completeRoleTask('prosecution', 'isAnalystDone')" class="primary" ${pData.isAnalystDone ? 'disabled' : ''}>
            ${pData.isAnalystDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;
    
    if (!isLocked) {
      renderEvidenceMarket("prosecution", data);
    }
  }
  // 3. 반박 전략가
  else if (myRole === "strategist") {
    const isLocked = false; // 단계별 잠금 해제
    
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>4단계 [공방 및 재반박]</b>로 진입해야 활성화됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <h3 class="mb-10">③ 반박 전략가 임무: 상대방 무죄 주장 무력화 및 재반박</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          피고인 측 변호인이 제시하는 알리바이(공유기 고장, 스마트폰 도용 등)와 위법 수집 증거 주장의 허점을 찌르고 유죄를 확립하기 위한 최종 반박문을 논리적으로 기술하세요.
        </p>
        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">피고인 측 반박에 대한 최종 재반박문</label>
            <button type="button" onclick="showExampleGuide('prosecution-strategist')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
          </div>
          <textarea id="p-counter-input" rows="6" placeholder="변호인의 공유기 고장 주장이나 도용 주장에 대한 모순 및 증거의 신빙성을 논박하세요..." oninput="updateLiveText('prosecution', 'counterArgument', this.value)" ${pData.isStrategistDone ? 'disabled' : ''}>${pData.counterArgument}</textarea>
        </div>
        <div class="flex-row-between">
          <span></span>
          <button onclick="completeRoleTask('prosecution', 'isStrategistDone')" class="primary" ${pData.isStrategistDone ? 'disabled' : ''}>
            ${pData.isStrategistDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;
  }
  // 4. 최종 변론가
  else if (myRole === "finalist") {
    const isLocked = false;
    
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>5단계 [최종 변론 및 구형]</b> 단계로 진행해야 해제됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <h3 class="mb-10">④ 최종 변론가 임무: 재판 요약 논증 및 최종 구형 제출</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          검찰의 입장을 최종적으로 밝히며, 배심원들이 피고인에게 유죄를 평결해야 하는 당위성을 설득력 있게 호소하는 최종 구형 및 변론 서면을 완성하십시오.
        </p>
        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">최종 변론 및 구형문</label>
            <button type="button" onclick="showExampleGuide('prosecution-finalist')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
          </div>
          <textarea id="p-final-input" rows="6" placeholder="존경하는 배심원 여러분, 피고인의 사이버 명예훼손 행위는 피해자에게 심각한 고통을..." oninput="updateLiveText('prosecution', 'finalStatement', this.value)" ${pData.isFinalistDone ? 'disabled' : ''}>${pData.finalStatement}</textarea>
        </div>
        <div class="flex-row-between">
          <span></span>
          <button onclick="completeRoleTask('prosecution', 'isFinalistDone')" class="primary" ${pData.isFinalistDone ? 'disabled' : ''}>
            ${pData.isFinalistDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;
  }
}

// ----------------------------------------------------
// 변호인 측 워크스페이스
// ----------------------------------------------------
function renderDefenseWorkspace(workspace, data, peerPrevs) {
  const dData = data.defenseData;
  const pData = data.prosecutionData;
  const currentStage = data.currentStage;
  
  workspace.innerHTML = `
    <div class="workspace-header">
      <h2>방어 모둠 (변호인 측) 워크스페이스</h2>
      <span style="background: var(--color-defense); color: #fff;">변호인</span>
    </div>
    ${peerPrevs}
    <div class="lock-overlay-container" id="role-panel-container">
      <!-- 동적 역할 폼 바인딩 -->
    </div>
    ${generateCombinedBriefHTML(data)}
  `;

  const container = document.getElementById("role-panel-container");

  // 1. 기조 답변인
  if (myRole === "speaker") {
    const isLocked = false;
    container.innerHTML = `
      <div class="glass-card">
        <h3 class="mb-10">① 기조 답변인 임무: 공소장 부인 및 답변서 요약 발표</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          검사의 공소사실을 부인하고, 강지민 학생에게는 죄가 없거나 억울한 사정이 있음을 요약하여 답변할 서면을 작성하세요.
        </p>
        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">기조 답변서 작성란</label>
            <button type="button" onclick="showExampleGuide('defense-speaker')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
          </div>
          <textarea id="d-opening-input" rows="7" placeholder="여기에 피고인의 무죄 주장 요지 및 검사 측 혐의 부인 답변을 작성해 주세요..." oninput="updateLiveText('defense', 'opening', this.value)" ${isLocked ? 'disabled' : ''}>${dData.opening}</textarea>
        </div>
        <div class="flex-row-between">
          <span style="font-size: 11.5px; color: var(--accent-blue-mid);">💡 모둠원들과 의견을 나누며 기조 답변을 작성하세요. 완료 시 내 역할 완료를 누릅니다.</span>
          <button onclick="completeRoleTask('defense', 'isSpeakerDone')" class="primary" ${dData.isSpeakerDone ? 'disabled' : ''}>
            ${dData.isSpeakerDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;
  }
  // 2. 증거 감시관 (핵심!)
  else if (myRole === "guard") {
    const isLocked = false; // 단계별 잠금 해제
    
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>3단계 [증거 조사 및 이의제기]</b>로 진입해야 활성화됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <div class="flex-row-between mb-10">
          <h3 style="margin: 0; font-size: 1.15rem; font-weight: bold; color: #fff;">② 증거 감시관 임무: 검사 제출 증거 모니터링 & 이의제기</h3>
          <button type="button" onclick="showExampleGuide('defense-guard')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 이의제기 가이드 보기</button>
        </div>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          검사(공격 모둠)가 제출하는 증거를 실시간으로 주시하고, 절차상 문제(영장 미소지, 사생활 침해, 강제 자백 등)가 발견되는 <b>'위법수집증거'</b>에 대해서는
          즉시 <b>[🚨 이의제기(Objection)]</b> 버튼을 클릭하여 재판장(교사)에게 배제 신청을 하십시오.
        </p>

        <h4 style="color: var(--color-prosecution); margin-bottom: 8px;">🔍 검사 측이 현재 법정에 제출한 증거 목록</h4>
        <div class="evidence-grid" id="prosecution-submitted-list" style="margin-bottom: 25px;">
          <!-- 실시간 제출된 검사 증거물 노출 -->
        </div>

        <div style="border-top: 1px dashed var(--glass-border); padding-top: 15px;">
          <h4 style="color: var(--accent-gold); margin-bottom: 8px;">📋 우리가 제기한 이의제기 판결 기록</h4>
          <div id="objections-history-list" style="font-size: 12px; display: flex; flex-direction: column; gap: 8px;">
            <!-- 이의제기 목록 동적 생성 -->
          </div>
        </div>

        <div class="flex-row-between" style="margin-top: 20px;">
          <span></span>
          <button onclick="completeRoleTask('defense', 'isGuardDone')" class="primary" ${dData.isGuardDone ? 'disabled' : ''}>
            ${dData.isGuardDone ? '역할 완료' : '감시 역할 완료'}
          </button>
        </div>
      </div>
    `;

    if (!isLocked) {
      renderProsecutionSubmittedEvidences(data);
      renderObjectionsHistory(data);
    }
  }
  // 3. 방어 논증가
  else if (myRole === "arguer") {
    const isLocked = false; // 단계별 잠금 해제
    
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>3단계 [증거 조사]</b> 단계로 진행해야 해제됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <h3 class="mb-10">③ 방어 논증가 임무: 무죄 입증 적법증거 선택 및 주논증서 작성</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          증거 마켓에서 피고인의 알리바이나 계정 도용 가능성을 입증할 적법 증거(E7, E8 등)를 채택하고,
          이와 대조하여 피고인의 무죄 혹은 정상참작 사유를 입증하는 논리적 방어 주장서를 기술하십시오.
        </p>

        <h4 class="evidence-market-title">🛒 모의재판 증거 마켓 (방어용 알리바이 및 도용 증거)</h4>
        <div class="evidence-grid" id="evidence-market-list">
          <!-- 증거 목록 동적 생성 -->
        </div>

        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">피고인 무죄 및 참작 변론 논증</label>
            <button type="button" onclick="showExampleGuide('defense-arguer')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
          </div>
          <textarea id="d-arg-input" rows="5" placeholder="채택한 방어 증거를 토대로 강지민 학생이 범행 시간에 기기를 다룰 수 없었거나 타인에게 계정을 탈취당했음을 서술하십시오..." oninput="updateLiveText('defense', 'argument', this.value)" ${dData.isArguerDone ? 'disabled' : ''}>${dData.argument}</textarea>
        </div>

        <div class="flex-row-between">
          <span style="font-size: 11.5px; color: var(--accent-gold);">선택한 방어 증거: <b id="selected-d-evids-badge">${dData.selectedEvidence.join(", ") || '없음'}</b></span>
          <button onclick="completeRoleTask('defense', 'isArguerDone')" class="primary" ${dData.isArguerDone ? 'disabled' : ''}>
            ${dData.isArguerDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;

    if (!isLocked) {
      renderEvidenceMarket("defense", data);
    }
  }
  // 4. 최종 변론가
  else if (myRole === "finalist") {
    const isLocked = false;
    
    container.innerHTML = `
      ${isLocked ? `
        <div class="lock-shield">
          <h4>🔒 역할 잠금 상태</h4>
          <p>
            교사가 <b>5단계 [최종 변론]</b>으로 이동해야 해제됩니다.
          </p>
        </div>
      ` : ""}
      <div class="glass-card">
        <h3 class="mb-10">④ 최종 변론가 임무: 최후 진술 및 피고인 구제 최후 변론</h3>
        <p class="mb-15" style="font-size:12.5px; color: var(--text-muted);">
          재판 전반의 불공정한 위법 증거들을 다시 한번 환기하고, 합리적 의심을 해소하여 배심원들에게 무죄 평결을 내려줄 것을 엄숙히 대변하는 최종 변론을 완결하세요.
        </p>
        <div class="form-group">
          <div class="flex-row-between" style="margin-bottom: 8px;">
            <label style="margin-bottom: 0;">피고인 대리인 최종 변론서</label>
            <button type="button" onclick="showExampleGuide('defense-finalist')" style="font-size: 11.5px; padding: 4px 10px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 예시 및 가이드 보기</button>
          </div>
          <textarea id="d-final-input" rows="6" placeholder="배심원 여러분, 수사기관은 헌법적 가치인 영장주의를 훼손한 채 일기장과 음성을..." oninput="updateLiveText('defense', 'finalStatement', this.value)" ${dData.isFinalistDone ? 'disabled' : ''}>${dData.finalStatement}</textarea>
        </div>
        <div class="flex-row-between">
          <span></span>
          <button onclick="completeRoleTask('defense', 'isFinalistDone')" class="primary" ${dData.isFinalistDone ? 'disabled' : ''}>
            ${dData.isFinalistDone ? '제출 완료됨' : '내 역할 완료 (제출)'}
          </button>
        </div>
      </div>
    `;
  }
}

// ----------------------------------------------------
// 배심원단 워크스페이스
// ----------------------------------------------------
function renderJuryWorkspace(workspace, data) {
  const currentStage = data.currentStage;
  const pData = data.prosecutionData;
  const dData = data.defenseData;

  workspace.innerHTML = `
    <div class="workspace-header">
      <h2>⚖️ 배심원단 관전 및 평결 워크스페이스</h2>
      <span style="background: var(--color-jury); color: #000;">배심원</span>
    </div>
    
    <div class="results-report-layout">
      <!-- 실시간 공방 요약 현황판 -->
      <div class="glass-card">
        <h3 style="color: var(--accent-gold); margin-bottom: 12px; font-size:14px;">📝 양측 제출 서면 실시간 모니터링 (배심원 판단 기초)</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size:12.5px;">
          <!-- 검사 측 작성 현황 -->
          <div style="background: rgba(59,130,246,0.05); padding: 12px; border-radius: 6px; border: 1px solid rgba(59,130,246,0.15);">
            <h4 style="color: var(--color-prosecution); margin-bottom: 6px;">공격 (검사) 측 서면</h4>
            <p><b>[기조]</b> ${pData.opening || '<span style="color: var(--text-muted)">작성 대기 중</span>'}</p><br>
            <p><b>[증거 및 논증]</b> ${pData.argument || '<span style="color: var(--text-muted)">작성 대기 중</span>'}</p>
            <p style="font-size:11px; color: var(--accent-gold-light); margin-top:4px;">제출 적법증거: ${pData.selectedEvidence.join(", ") || '없음'}</p><br>
            <p><b>[재반박]</b> ${pData.counterArgument || '<span style="color: var(--text-muted)">작성 대기 중</span>'}</p><br>
            <p><b>[최종변론]</b> ${pData.finalStatement || '<span style="color: var(--text-muted)">작성 대기 중</span>'}</p>
          </div>

          <!-- 변호인 측 작성 현황 -->
          <div style="background: rgba(239,68,68,0.05); padding: 12px; border-radius: 6px; border: 1px solid rgba(239,68,68,0.15);">
            <h4 style="color: var(--color-defense); margin-bottom: 6px;">방어 (변호인) 측 서면</h4>
            <p><b>[기조]</b> ${dData.opening || '<span style="color: var(--text-muted)">작성 대기 중</span>'}</p><br>
            <p><b>[증거 및 논증]</b> ${dData.argument || '<span style="color: var(--text-muted)">작성 대기 중</span>'}</p>
            <p style="font-size:11px; color: var(--accent-gold-light); margin-top:4px;">제출 방어증거: ${dData.selectedEvidence.join(", ") || '없음'}</p><br>
            <p><b>[이의제기 내역]</b> 제기: ${dData.objections.length}회</p><br>
            <p><b>[최종변론]</b> ${dData.finalStatement || '<span style="color: var(--text-muted)">작성 대기 중</span>'}</p>
          </div>
        </div>
      </div>

      <!-- 배심원 메모장 (개별 로컬 임시 저장으로 세션 초기화 방지) -->
      <div class="glass-card">
        <h3 style="color: var(--accent-gold); margin-bottom: 8px; font-size:13px;">📝 배심원 개인 재판 메모장 (나만 보기)</h3>
        <textarea id="juror-private-memo" rows="4" placeholder="양측 주장의 신빙성이나 위법수집증거 배제 위반 사항을 기록해 두세요. 평결 투표 시 참고용입니다..." oninput="localStorage.setItem('juror_memo_' + sessionId, this.value)">${localStorage.getItem('juror_memo_' + sessionId) || ''}</textarea>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// 7단계: 배심원 평결 및 최종 결과 화면 (전원 공유)
// ----------------------------------------------------
function renderStage7Workspace(workspace, data) {
  const isJuror = myRole === "juror";
  const myVote = data.juryData.votes[myName];

  // 배심원 평결 현황 계산
  const votes = Object.values(data.juryData.votes);
  const guiltyCount = votes.filter(v => v === "guilty").length;
  const innocentCount = votes.filter(v => v === "innocent").length;
  const totalVotes = votes.length;
  
  const guiltyPct = totalVotes > 0 ? Math.round((guiltyCount / totalVotes) * 100) : 0;
  const innocentPct = totalVotes > 0 ? Math.round((innocentCount / totalVotes) * 100) : 0;

  workspace.innerHTML = `
    <div class="workspace-header">
      <h2>7단계: 배심원 평결 및 최종 판결</h2>
      <span style="background: var(--accent-gold); color: #000;">판결</span>
    </div>

    <div class="results-report-layout">
      <!-- 1. 배심원 평결 결과 투표함 -->
      <div class="results-stats-row">
        <div class="glass-card text-center" style="display:flex; flex-direction:column; justify-content:center; gap: 15px;">
          <h3 style="color: var(--accent-gold);">🗳️ 배심원 평결 실시간 현황</h3>
          <div style="font-size: 1.1rem; color: var(--text-muted);">총 투표수: <b style="color:#fff;">${totalVotes}</b>표</div>
          <div style="display: flex; height: 35px; border-radius: 8px; overflow: hidden; margin: 15px 0;">
            <div style="width: ${guiltyPct}%; background: linear-gradient(to right, #7f1d1d, var(--color-defense)); display: flex; align-items: center; justify-content: center; font-size:12px; font-weight:bold; transition: width 0.5s;">
              ${guiltyPct > 0 ? `유죄 (${guiltyPct}%)` : ''}
            </div>
            <div style="width: ${innocentPct}%; background: linear-gradient(to right, var(--color-jury), #064e3b); display: flex; align-items: center; justify-content: center; font-size:12px; font-weight:bold; transition: width 0.5s;">
              ${innocentPct > 0 ? `무죄 (${innocentPct}%)` : ''}
            </div>
          </div>
          <div style="display:flex; justify-content:space-around; font-size:14px;">
            <span style="color: var(--color-defense);">⚖️ 유죄 평결: <b>${guiltyCount}표</b></span>
            <span style="color: var(--color-jury);">⚖️ 무죄 평결: <b>${innocentCount}표</b></span>
          </div>
        </div>

        <!-- 배심원단 개별 투표 폼 (배심원 전용) -->
        <div class="glass-card">
          <h3 style="color: var(--accent-gold); margin-bottom: 10px;">🗳️ 배심원 평결 투표지</h3>
          ${isJuror ? `
            ${myVote ? `
              <div class="text-center" style="padding: 20px 0;">
                <p style="font-size: 16px; color: var(--color-jury); font-weight: bold;">투표를 완료하셨습니다.</p>
                <p style="font-size: 13px; color: var(--text-muted); margin-top: 5px;">선택: ${myVote === 'guilty' ? '유죄(승소)' : '무죄(패소)'}</p>
              </div>
            ` : `
              <div style="display:flex; flex-direction:column; gap:12px;">
                <p style="font-size:12.5px; color:var(--text-muted);">제출된 유무죄 증거 및 헌법상 적법절차 원칙에 기초하여 정당한 판결을 선택하십시오.</p>
                <div class="verdict-vote-buttons">
                  <button onclick="submitVote('guilty')" class="vote-btn-guilty">유 죄</button>
                  <button onclick="submitVote('innocent')" class="vote-btn-innocent">무 죄</button>
                </div>
                <div class="form-group" style="margin-top: 10px;">
                  <div class="flex-row-between" style="margin-bottom: 8px;">
                    <label for="jury-rationale-input" style="margin-bottom: 0;">평결 소명서 (한 줄 이유)</label>
                    <button type="button" onclick="showExampleGuide('juror-verdict')" style="font-size: 11.5px; padding: 2px 8px; height: auto; background: var(--bg-tertiary); border-color: rgba(37,99,235,0.15);">📋 작성 예시 보기</button>
                  </div>
                  <input type="text" id="jury-rationale-input" placeholder="이 판결을 내린 법적 근거 또는 정황을 한 줄로 작성해 주세요." maxlen="60">
                </div>
              </div>
            `}
          ` : `
            <div class="text-center" style="padding: 30px 0; color: var(--text-muted); font-size:13px;">
              💡 모둠 역할자(검사/변호인)는 투표 권한이 없습니다.<br>
              배심원단이 실시간 평결 투표를 하는 모습을 지켜보세요.
            </div>
          `}
        </div>
      </div>

      <!-- 2. 배심원 한 줄 평 결론 피드 목록 -->
      <div class="glass-card">
        <h3 style="color: var(--accent-gold); margin-bottom: 10px; font-size:13px;">💬 배심원 평결 요지 및 한 줄 평</h3>
        <div class="jury-comments-feed" id="jury-votes-comments-list">
          <!-- 평결 코멘트 동적 생성 -->
        </div>
      </div>
    </div>
  `;

  // 배심원 코멘트 채우기
  const commentsList = document.getElementById("jury-votes-comments-list");
  commentsList.innerHTML = "";
  
  const studentKeys = Object.keys(data.students);
  let count = 0;
  
  studentKeys.forEach((name) => {
    const s = data.students[name];
    if (s.role === "juror" && data.juryData.votes[name]) {
      const voteVal = data.juryData.votes[name];
      // 찾아낸 평결 사유 매칭 (feed나 juryData.comments에 기록된 것 대체 가능하도록 처리)
      const feedComment = data.juryData.comments.find(c => c.name === name);
      const reasonText = feedComment ? feedComment.text : "법리 검토 완료";
      
      const card = document.createElement("div");
      card.style.background = "rgba(255,255,255,0.02)";
      card.style.border = "1px solid var(--glass-border)";
      card.style.borderRadius = "6px";
      card.style.padding = "10px";
      card.style.fontSize = "12px";
      card.style.display = "flex";
      card.style.justifyContent = "space-between";
      card.style.alignItems = "center";
      
      card.innerHTML = `
        <div>
          <b>👤 배심원 [${name}]</b>: <span style="color: var(--text-muted); font-style: italic;">"${reasonText}"</span>
        </div>
        <span style="font-weight: bold; font-size:11px; padding: 2px 8px; border-radius: 4px; ${voteVal === 'guilty' ? 'background: rgba(239,68,68,0.15); color: var(--color-defense);' : 'background: rgba(16,185,129,0.15); color: var(--color-jury);'}">
          ${voteVal === 'guilty' ? '유죄(원고승)' : '무죄(피고승)'}
        </span>
      `;
      commentsList.appendChild(card);
      count++;
    }
  });

  if (count === 0) {
    commentsList.innerHTML = `<div style="text-align:center; padding:20px; color: var(--text-muted);">아직 평결을 내린 배심원이 없습니다.</div>`;
  }
}

// 배심원 평결 제출
function submitVote(voteVal) {
  const rationaleInput = document.getElementById("jury-rationale-input");
  const reason = rationaleInput ? rationaleInput.value.trim() : "법과 원칙에 따름";
  
  if (!reason) {
    alert("평결 내린 간략한 이유를 작성해 주세요.");
    return;
  }

  // 1. 투표 밸류 업데이트
  const updatedVotes = { ...sessionData.juryData.votes };
  updatedVotes[myName] = voteVal;
  window.MockTrial.DB.updateData(sessionId, "jury", "votes", updatedVotes);

  // 2. 코멘트 어레이 업데이트
  const updatedComments = [ ...sessionData.juryData.comments ];
  updatedComments.push({ name: myName, text: reason, timestamp: Date.now() });
  window.MockTrial.DB.updateData(sessionId, "jury", "comments", updatedComments);

  // 3. 법정 피드 송출
  window.MockTrial.DB.sendFeedMessage(sessionId, `배심원 [${myName}]`, `[평결 완료] 피고인에 대해 ${voteVal === 'guilty' ? '유죄' : '무죄'} 취지로 투표하였습니다.`, "jury");
}

// ----------------------------------------------------
// ⑤ 증거물 마켓 렌더링 및 모달 처리 (상세/이의제기)
// ----------------------------------------------------
function renderEvidenceMarket(type, data) {
  const marketList = document.getElementById("evidence-market-list");
  marketList.innerHTML = "";

  const evidences = window.MockTrial.scenarios["cyber-defamation"].evidenceMarket;
  const teamData = type === "prosecution" ? data.prosecutionData : data.defenseData;

  evidences.forEach((ev) => {
    // 검사 측 마켓에는 prosecution타입 증거를, 변호인 측 마켓에는 defense타입 증거를 보여줌
    // (물론 시나리오 기획상 전체를 다 보여주고 적법성만 추리하도록 유도할 수도 있음)
    if (ev.type !== type && ev.type !== "neutral") return;

    const isSubmitted = teamData.selectedEvidence.includes(ev.id);

    const card = document.createElement("div");
    // [교육적 업그레이드]: 학생 화면에서는 'legal/illegal' 클레스와 태그를 제거해 블라인드 처리!
    // 순수히 설명문만 보고 맞춰야 교육 효과가 극대화됨.
    card.className = `evidence-card ${isSubmitted ? 'submitted' : ''}`;
    
    // 만약 완료된 상태이면 선택 비활성
    card.onclick = () => openEvidenceModal(ev.id, type);

    card.innerHTML = `
      <h4>📂 ${ev.id}: ${ev.name}</h4>
      <p>${ev.description}</p>
      <span class="status-indicator" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">
        제출처: ${ev.source}
      </span>
    `;
    marketList.appendChild(card);
  });
}

// 검사가 제출한 증거물 목록 (변호사 증거감시관용)
function renderProsecutionSubmittedEvidences(data) {
  const container = document.getElementById("prosecution-submitted-list");
  container.innerHTML = "";

  const subIds = data.prosecutionData.selectedEvidence;
  const allEvs = window.MockTrial.scenarios["cyber-defamation"].evidenceMarket;

  if (subIds.length === 0) {
    container.innerHTML = `<div style="grid-column: span 3; text-align:center; padding:20px; color: var(--text-muted); border:1px dashed var(--glass-border); border-radius:8px;">아직 검사 측이 제출한 증거가 없습니다.</div>`;
    return;
  }

  subIds.forEach((id) => {
    const ev = allEvs.find(e => e.id === id);
    if (!ev) return;

    const card = document.createElement("div");
    card.className = "evidence-card";
    card.onclick = () => openObjectionModal(ev.id);

    card.innerHTML = `
      <h4 style="color: var(--color-prosecution);">📂 ${ev.id}: ${ev.name}</h4>
      <p>${ev.description}</p>
      <div class="flex-row-between" style="margin-top: 5px;">
        <span class="status-indicator" style="background: rgba(239, 68, 68, 0.15); color: var(--color-defense); font-size:10px;">🚨 이의제기 검토하기</span>
      </div>
    `;
    container.innerHTML += card.outerHTML;
  });
}

// 이의제기 이력 렌더링
function renderObjectionsHistory(data) {
  const container = document.getElementById("objections-history-list");
  container.innerHTML = "";

  const history = data.defenseData.objections;
  if (history.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); font-style:italic;">제출한 이의제기 기록이 없습니다.</p>`;
    return;
  }

  history.forEach((obj) => {
    const statusMap = {
      pending: "⏳ 재판장 심리 중",
      sustained: "✅ 인용 (적법절차 위반 - 증거 배제)",
      overruled: "❌ 기각 (적법 증거 인정)"
    };
    
    const colors = {
      pending: "orange",
      sustained: "var(--color-jury)",
      overruled: "var(--color-defense)"
    };

    const block = document.createElement("div");
    block.style.background = "rgba(0,0,0,0.2)";
    block.style.padding = "8px 12px";
    block.style.borderRadius = "6px";
    block.style.borderLeft = `3px solid ${colors[obj.result]}`;
    
    block.innerHTML = `
      <div class="flex-row-between">
        <b>[이의제기] 증거: ${obj.evidenceId}</b>
        <span style="font-weight: bold; color: ${colors[obj.result]};">${statusMap[obj.result]}</span>
      </div>
      <p style="font-size:11.5px; color: var(--text-muted); margin-top: 3px;">주장: ${obj.text}</p>
    `;
    container.appendChild(block);
  });
}

// 증거 마켓 모달창 열기
function openEvidenceModal(evidenceId, roleType) {
  selectedEvidenceId = evidenceId;
  const ev = window.MockTrial.scenarios["cyber-defamation"].evidenceMarket.find(e => e.id === evidenceId);
  if (!ev) return;

  document.getElementById("evidence-modal-header").innerText = `📂 [증거분석] ${ev.id}: ${ev.name}`;
  document.getElementById("evidence-modal-source").innerText = ev.source;
  document.getElementById("evidence-modal-desc").innerText = ev.description;
  
  // 힌트 출력 (블라인드 테스트를 돕는 간접 힌트)
  document.getElementById("evidence-modal-context").innerText = ev.legalContext;

  // 액션 패널 초기화
  document.getElementById("action-prosecutor-select").style.display = "none";
  document.getElementById("action-defense-objection").style.display = "none";

  // 검사(증거분석관)이고 아직 분석완료 안 한 경우 채택 양식 열기
  if (roleType === "prosecution" && myRole === "analyst" && !sessionData.prosecutionData.isAnalystDone) {
    document.getElementById("action-prosecutor-select").style.display = "flex";
    document.getElementById("prosecutor-evidence-arg").value = "";
  }

  document.getElementById("evidence-modal").style.display = "flex";
}

// 검사 측 증거 채택 제출
function submitProsecutionEvidence() {
  const argText = document.getElementById("prosecutor-evidence-arg").value.trim();
  if (!argText) {
    alert("이 증거가 왜 중요하며 적법한지 주논증 내용을 입력해 주세요.");
    return;
  }

  // 중복 추가 방지
  const updatedEvs = [ ...sessionData.prosecutionData.selectedEvidence ];
  if (!updatedEvs.includes(selectedEvidenceId)) {
    updatedEvs.push(selectedEvidenceId);
    window.MockTrial.DB.updateData(sessionId, "prosecution", "selectedEvidence", updatedEvs);
  }

  // 피드 알림 및 모달 닫기
  window.MockTrial.DB.sendFeedMessage(sessionId, `검사 [${myName}]`, `[증거물 제출] [${selectedEvidenceId}: ${getEvidenceName(selectedEvidenceId)}]을 법정에 제출하였습니다.`, "prosecution");
  
  closeEvidenceModal();
  updateStudentDashboard(sessionData);
}

// 이의제기용 검토 모달 열기 (변호사 증거감시관 전용)
function openObjectionModal(evidenceId) {
  selectedEvidenceId = evidenceId;
  const ev = window.MockTrial.scenarios["cyber-defamation"].evidenceMarket.find(e => e.id === evidenceId);
  if (!ev) return;

  document.getElementById("evidence-modal-header").innerText = `🚨 [이의제기 검토] ${ev.id}: ${ev.name}`;
  document.getElementById("evidence-modal-source").innerText = ev.source;
  document.getElementById("evidence-modal-desc").innerText = ev.description;
  document.getElementById("evidence-modal-context").innerText = ev.legalContext;

  document.getElementById("action-prosecutor-select").style.display = "none";
  
  // 감시관인 경우 이의제기 폼 활성화
  if (myRole === "guard" && !sessionData.defenseData.isGuardDone) {
    document.getElementById("action-defense-objection").style.display = "flex";
    document.getElementById("defense-objection-reason").value = "";
  }

  document.getElementById("evidence-modal").style.display = "flex";
}

// 변호사 측 이의제기 송출
function submitObjection() {
  const lawType = document.getElementById("defense-objection-law-type").value;
  const reasonText = document.getElementById("defense-objection-reason").value.trim();

  if (!reasonText) {
    alert("이의제기 사유를 구체적으로 소명해 주십시오.");
    return;
  }

  const lawLabels = {
    warrant: "영장주의 위반",
    telecom: "통신비밀보호법 비밀녹음 위반",
    coercion: "자백배제법칙 위반 (강제자백)",
    hearsay: "적법절차 위반 (사생활 침해)"
  };

  const newObjection = {
    evidenceId: selectedEvidenceId,
    timestamp: Date.now(),
    lawType: lawType,
    lawLabel: lawLabels[lawType],
    text: reasonText,
    result: "pending" // 교사가 판단할 때까지 보류
  };

  const updatedObjections = [ ...sessionData.defenseData.objections ];
  updatedObjections.push(newObjection);
  window.MockTrial.DB.updateData(sessionId, "defense", "objections", updatedObjections);

  // 실시간 피드에 긴급 알림 전송
  window.MockTrial.DB.sendFeedMessage(sessionId, `변호인 [${myName}]`, `🚨 [이의제기 신청] 검사 측 제출 증거 [${selectedEvidenceId}]에 대해 위법수집증거 및 적법절차 위반(${lawLabels[lawType]})을 이유로 배제를 청구합니다!`, "objection");

  closeEvidenceModal();
}

function closeEvidenceModal() {
  document.getElementById("evidence-modal").style.display = "none";
}

// 유틸리티: 증거물 아이디로 이름 찾기
function getEvidenceName(id) {
  const ev = window.MockTrial.scenarios["cyber-defamation"].evidenceMarket.find(e => e.id === id);
  return ev ? ev.name : id;
}

// ----------------------------------------------------
// ⑤ 교사용 이의제기 Live 판결 팝업 처리
// ----------------------------------------------------
function handleObjectionTeacherPopup(data) {
  const panel = document.getElementById("teacher-objection-decision-panel");
  const objections = data.defenseData.objections;
  
  // 아직 판결 대기 중인 이의제기가 있는지 확인
  const pendingObj = objections.find(o => o.result === "pending");

  if (pendingObj) {
    document.getElementById("objection-target-evidence-name").innerText = `${pendingObj.evidenceId} - ${getEvidenceName(pendingObj.evidenceId)}`;
    document.getElementById("objection-violation-type").innerText = pendingObj.lawLabel;
    document.getElementById("objection-comment").innerText = `"${pendingObj.text}"`;
    
    // 시간 표시 갱신
    const elapsed = Math.round((Date.now() - pendingObj.timestamp) / 1000);
    document.getElementById("objection-time-badge").innerText = `${elapsed}초 전 접수됨`;

    panel.style.display = "block";
  } else {
    panel.style.display = "none";
  }
}

// 교사용 이의제기 판결 실행 (인용 / 기각)
function resolveObjection(resultVal) {
  const objections = [ ...sessionData.defenseData.objections ];
  const pendingIdx = objections.findIndex(o => o.result === "pending");
  if (pendingIdx === -1) return;

  const targetObj = objections[pendingIdx];
  targetObj.result = resultVal; // sustained or overruled
  
  // 1. 이의제기 히스토리 갱신
  window.MockTrial.DB.updateData(sessionId, "defense", "objections", objections);

  // 2. 인용인 경우, 검사 측 채택 증거에서 해당 증거 자동 박탈!! (위법수집증거 배제 법칙 연동)
  if (resultVal === "sustained") {
    const updatedPEvids = sessionData.prosecutionData.selectedEvidence.filter(id => id !== targetObj.evidenceId);
    window.MockTrial.DB.updateData(sessionId, "prosecution", "selectedEvidence", updatedPEvids);
    
    // 재판장 선포 송출
    window.MockTrial.DB.sendFeedMessage(sessionId, "재판장(교사)", `⚖️ [이의제기 인용] 변호인의 사법 소명이 인정되어 증거 [${targetObj.evidenceId}]를 법정에서 전면 배제합니다. (증거능력 박탈)`, "stage");
  } else {
    // 기각
    window.MockTrial.DB.sendFeedMessage(sessionId, "재판장(교사)", `⚖️ [이의제기 기각] 검사 측 증거 수집 과정에 위법이 발견되지 않으므로 증거 [${targetObj.evidenceId}]의 증거능력을 정식 인정합니다.`, "stage");
  }
}

// ----------------------------------------------------
// ⑥ 협업 락(Lock) 해제 및 피드백 갱신 바인딩
// ----------------------------------------------------
function updateLiveText(team, key, value) {
  // 실시간 타이핑 내용 파이어베이스/로컬디비에 업데이트하여 팀원 및 교사 실시간 동기화 지원
  window.MockTrial.DB.updateData(sessionId, team, key, value);
}

function completeRoleTask(team, lockKey) {
  window.MockTrial.DB.updateData(sessionId, team, lockKey, true);
  
  const roleNameMap = {
    isSpeakerDone: "기조 진술",
    isAnalystDone: "증거물 분석 및 제출",
    isStrategistDone: "재반박 논증",
    isFinalistDone: "최종 변론 수립",
    isGuardDone: "증거 감시 및 이의제기 검토",
    isArguerDone: "방어 논증 및 알리바이 입증"
  };

  window.MockTrial.DB.sendFeedMessage(sessionId, `알림 [${myName}]`, `[임무 완료] [${roleNameMap[lockKey] || lockKey}] 파트 입력을 마치고 모둠 공유를 잠금 해제했습니다.`, team);
}

// ----------------------------------------------------
// ⑦ 최종 판결문 PDF 출력 모듈 (아카이빙 양식 빌더)
// ----------------------------------------------------
function triggerPrintReport() {
  if (!sessionData) return;
  
  const modal = document.getElementById("report-modal");
  const content = document.getElementById("print-sheet-content");

  // 대한민국 법원 공식 판결문 서식으로 작성물 빌드
  const pData = sessionData.prosecutionData;
  const dData = sessionData.defenseData;
  const jData = sessionData.juryData;

  const votes = Object.values(jData.votes);
  const guiltyCount = votes.filter(v => v === "guilty").length;
  const innocentCount = votes.filter(v => v === "innocent").length;
  
  // 다수결 평결 결론
  let verdictConclusion = "미결정 (평결 진행 중)";
  let verdictStyle = "color: #000;";
  if (votes.length > 0) {
    if (guiltyCount > innocentCount) {
      verdictConclusion = "피고인은 유죄이다.";
      verdictStyle = "color: var(--color-defense); font-weight: 900;";
    } else if (innocentCount > guiltyCount) {
      verdictConclusion = "피고인은 무죄이다.";
      verdictStyle = "color: var(--color-jury); font-weight: 900;";
    } else {
      verdictConclusion = "동수 의견으로 무죄추정의 원칙에 따라 무죄로 의제한다.";
      verdictStyle = "color: var(--color-jury); font-weight: 900;";
    }
  }

  // 증거 배제 히스토리 요약 작성
  let evidenceHistoryHTML = "";
  const allEvs = window.MockTrial.scenarios["cyber-defamation"].evidenceMarket;
  
  // 검사 제출 적법 증거 요약
  evidenceHistoryHTML += `<h5>[검사 측 제출 증거]</h5><ul>`;
  pData.selectedEvidence.forEach(id => {
    const e = allEvs.find(ev => ev.id === id);
    evidenceHistoryHTML += `<li><b>${id} (${e.name})</b>: 적법 판정</li>`;
  });
  if (pData.selectedEvidence.length === 0) evidenceHistoryHTML += `<li>제출된 적법 증거 없음</li>`;
  evidenceHistoryHTML += `</ul>`;

  // 이의제기 심리 요약
  evidenceHistoryHTML += `<h5 style="margin-top:10px;">[이의제기 심리 판결 결과]</h5><ul>`;
  dData.objections.forEach(obj => {
    const stText = obj.result === 'sustained' ? '인용 (증거 배제)' : '기각 (증거 능력 인정)';
    evidenceHistoryHTML += `<li><b>${obj.evidenceId}에 대한 이의제기</b>: 위법사유 (${obj.lawLabel}) -> <b>[재판장 판정: ${stText}]</b></li>`;
  });
  if (dData.objections.length === 0) evidenceHistoryHTML += `<li>이의제기 신청 이력 없음</li>`;
  evidenceHistoryHTML += `</ul>`;

  // 배심원 평결 의견
  let juryCommentsHTML = "";
  jData.comments.forEach(c => {
    juryCommentsHTML += `<div>- <b>${c.name}</b>: "${c.text}"</div>`;
  });

  const now = new Date();
  const dateString = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  content.innerHTML = `
    <div style="font-family: 'Noto Sans KR', serif; color: #000; padding: 20px; line-height: 1.8;">
      <div style="text-align: center; font-size: 2.2rem; font-weight: bold; letter-spacing: 0.3em; margin-bottom: 25px;">판 결 문</div>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 14px;">
        <tr>
          <td style="width: 120px; font-weight: bold; padding: 6px 0;">사 건 번 호 :</td>
          <td style="padding: 6px 0;">2026고합101 정보통신망법 위반 (사이버 명예훼손)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding: 6px 0;">피  고  인 :</td>
          <td style="padding: 6px 0;">강 지 민 (한솔고등학교 1학년)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding: 6px 0;">검  사  측 :</td>
          <td style="padding: 6px 0;">검사 모둠원 일동 (소송 대리인)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding: 6px 0;">변  호  인 :</td>
          <td style="padding: 6px 0;">변호인 모둠원 일동 (소송 대리인)</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding: 6px 0;">판결 선고일 :</td>
          <td style="padding: 6px 0;">${dateString}</td>
        </tr>
      </table>

      <hr style="border: 0; border-top: 2px solid #000; margin-bottom: 25px;">

      <div style="margin-bottom: 25px;">
        <h4 style="font-size: 1.1rem; font-weight: bold; border-left: 4px solid #000; padding-left: 8px; margin-bottom: 10px;">주 문</h4>
        <div style="font-size: 1.2rem; padding: 10px; background: #f1f5f9; border-radius: 4px; text-align: center; ${verdictStyle}">
          ${verdictConclusion}
        </div>
      </div>

      <div style="margin-bottom: 25px;">
        <h4 style="font-size: 1.1rem; font-weight: bold; border-left: 4px solid #000; padding-left: 8px; margin-bottom: 10px;">이 유</h4>
        
        <div style="margin-bottom: 15px;">
          <h5 style="font-weight: bold; margin-bottom: 4px;">1. 소송 당사자들의 주장요지</h5>
          <p style="text-indent: 10px; font-size:13px;"><b>[검사 기조 요지]</b>: ${pData.opening || '미작성'}</p>
          <p style="text-indent: 10px; font-size:13px; margin-top: 5px;"><b>[변호인 기조 요지]</b>: ${dData.opening || '미작성'}</p>
        </div>

        <div style="margin-bottom: 15px;">
          <h5 style="font-weight: bold; margin-bottom: 4px;">2. 증거 능력의 판단 및 배제 내역 (위법수집증거 법칙 심리)</h5>
          <div style="font-size:12.5px; background:#f8fafc; padding:10px; border-radius:4px; border:1px solid #e2e8f0;">
            ${evidenceHistoryHTML}
          </div>
        </div>

        <div style="margin-bottom: 15px;">
          <h5 style="font-weight: bold; margin-bottom: 4px;">3. 법정 최종 변론 논증</h5>
          <p style="text-indent: 10px; font-size:13px;"><b>[공격 검찰 주논증]</b>: ${pData.argument || '미작성'}</p>
          <p style="text-indent: 10px; font-size:13px;"><b>[방어 변호 주논증]</b>: ${dData.argument || '미작성'}</p>
          <p style="text-indent: 10px; font-size:13px; margin-top: 5px;"><b>[최종 구형 및 최후 변론]</b>: 검사(${pData.finalStatement || '미작성'}), 변호인(${dData.finalStatement || '미작성'})</p>
        </div>

        <div>
          <h5 style="font-weight: bold; margin-bottom: 4px;">4. 배심원 평결 평정 통계</h5>
          <p style="font-size:13px;">본 재판은 국민 참여 재판 취지에 따라 한솔고 배심원단의 평결을 거쳤음.</p>
          <p style="font-size:13px; font-weight: bold; color: var(--accent-gold-dark);">[평결 결과] 유죄 찬성: ${guiltyCount}표 (${guiltyPct}%) | 무죄 찬성: ${innocentCount}표 (${innocentPct}%)</p>
          <div style="font-size:12px; margin-top: 8px; max-height: 150px; overflow-y: auto;">
            ${juryCommentsHTML}
          </div>
        </div>
      </div>

      <div style="text-align: center; margin-top: 40px; font-size: 1.1rem; font-weight: bold;">
        대한민국 법원 한솔고 모의법정 재판부
      </div>
    </div>
  `;

  modal.style.display = "flex";
}

function printReportDocument() {
  // 브라우저 프린터 드라이버(PDF 저장 가능) 호출
  window.print();
}

function closeReportModal() {
  document.getElementById("report-modal").style.display = "none";
}

function handleLogout() {
  if (confirm("로그아웃 하시겠습니까?")) {
    // 자동 재접속 제거
    localStorage.removeItem("reconnect_session_id");
    localStorage.removeItem("reconnect_student_name");
    sessionStorage.removeItem("reconnect_session_id");
    sessionStorage.removeItem("reconnect_student_name");
    location.reload();
  }
}

// ----------------------------------------------------
// ⑧ 초기화 코드 및 튕김 복구 로직
// ----------------------------------------------------
window.onload = () => {
  // BroadcastChannel 수신 시 화면 플래시 연출 및 피드 로그 즉시 업데이트 연동
  if (window.MockTrial.DB.channel) {
    window.MockTrial.DB.channel.addEventListener("message", (event) => {
      const { sessionId, type, data } = event.data;
      if (sessionId === window.MockTrial.DB.currentSessionId && type === "UPDATE") {
        
        // 이의제기가 새로 등록되었을 때 화면에 번쩍이는 Objection 플래시!
        if (sessionData && data.defenseData.objections.length > sessionData.defenseData.objections.length) {
          triggerObjectionFlash();
        }
      }
    });
  }

  // 이전 localStorage 방식의 쓰레기 캐시가 브라우저에 남아있어 오작동(대기실 갇힘)을 유발하는 문제 강제 차단
  if (localStorage.getItem("reconnect_session_id") || localStorage.getItem("reconnect_student_name")) {
    localStorage.removeItem("reconnect_session_id");
    localStorage.removeItem("reconnect_student_name");
  }

  // 튕김 방지 및 자동 재접속 복구 로직 (세션스토리지를 이용해 탭간 침범 방지)
  const savedSessionId = sessionStorage.getItem("reconnect_session_id");
  const savedStudentName = sessionStorage.getItem("reconnect_student_name");
  if (savedSessionId && savedStudentName) {
    console.log("튕김 방지: 이전 접속 정보 복구를 시도합니다.", savedSessionId, savedStudentName);
    autoReconnectStudent(savedSessionId, savedStudentName);
  }

  // 교사 PIN 패스코드 입력기 초기화
  initPinEntry();
};

// 학생 자동 재접속 함수
function autoReconnectStudent(savedSessionId, savedStudentName) {
  const session = window.MockTrial.DB.getSession(savedSessionId);
  if (!session) {
    sessionStorage.removeItem("reconnect_session_id");
    sessionStorage.removeItem("reconnect_student_name");
    return;
  }

  // 세션 입장 시도
  const result = window.MockTrial.DB.joinSession(savedSessionId, savedStudentName);
  if (!result.success) {
    sessionStorage.removeItem("reconnect_session_id");
    sessionStorage.removeItem("reconnect_student_name");
    return;
  }

  sessionId = savedSessionId;
  myName = savedStudentName;
  userType = "student";

  // 화면을 대기 화면으로 초기 설정 (나중에 onSessionUpdate에서 역할 배정 감지 시 메인으로 자동 이동함)
  document.getElementById("wait-session-code").innerText = sessionId;
  showScreen("waiting-screen");

  // 실시간 동기화 바인딩
  window.MockTrial.DB.onSessionUpdate(sessionId, (data) => {
    sessionData = data;
    const me = data.students[myName];
    
    if (me) {
      myRole = me.role;
      myTeam = me.team;
    }

    if (myTeam && myRole) {
      if (document.getElementById("waiting-screen").classList.contains("active") || 
          document.getElementById("login-screen").classList.contains("active")) {
        showScreen("trial-screen");
        
        // 튕겨서 재접속한 경우 비주얼 노벨이나 가이드라인을 매번 강제로 띄우지 않고 자연스럽게 진행
        if (data.currentStage === 1) {
          startVisualNovel();
        }
      }
      updateStudentDashboard(data);
    } else {
      document.getElementById("my-assigned-badge").style.display = "none";
      showScreen("waiting-screen");
    }
  });

  // 브라우저 닫거나 이탈 시 퇴장 처리
  window.addEventListener("beforeunload", () => {
    window.MockTrial.DB.disconnectStudent(sessionId, myName);
  });
}

// 이의제기 플래시 레이어 번쩍이는 연출
function triggerObjectionFlash() {
  const flash = document.getElementById("objection-flash");
  flash.classList.add("active");
  setTimeout(() => {
    flash.classList.remove("active");
  }, 350);
}

// 세션 코드 클립보드 복사 함수
function copySessionCode() {
  let code = "";
  if (userType === "teacher") {
    code = document.getElementById("session-code-val").innerText;
  } else {
    // 학생 화면: 대기실 또는 메인 재판 화면에 따라 값 탐색
    const waitCodeEl = document.getElementById("wait-session-code");
    const trialCodeEl = document.getElementById("student-session-code-val");
    
    if (waitCodeEl && waitCodeEl.innerText !== "000000" && waitCodeEl.innerText !== "") {
      code = waitCodeEl.innerText;
    } else if (trialCodeEl && trialCodeEl.innerText !== "000000" && trialCodeEl.innerText !== "") {
      code = trialCodeEl.innerText;
    }
  }

  if (!code || code === "------" || code === "000000") return;

  navigator.clipboard.writeText(code).then(() => {
    alert("수업 세션 코드가 클립보드에 복사되었습니다: " + code);
  }).catch(err => {
    console.error("클립보드 복사 실패", err);
    alert("세션 코드를 드래그하여 복사해 주세요: " + code);
  });
}

// ==========================================
// ⑨ 작성 예시 및 법리 가이드 데이터셋 & 함수
// ==========================================
const EXAMPLES_AND_GUIDES = {
  "prosecution-speaker": {
    title: "공격 모둠 - 기조 대변인 서면 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-prosecution); border-left: 3px solid var(--color-prosecution); padding-left: 6px;">공소사실 기조 변론 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>피고인의 인적사항 및 죄명 명시</b>: 사건 피고인과 범행 혐의를 명확히 밝힙니다.</li>
          <li><b>범행 요건 증명 예고</b>: 비방의 목적, 공연성(전파 가능성), 특정성(피해자가 명확히 지목됨)이 성립함을 설명합니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">기조 변론 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main);">
          "피고인 최민우는 2025년 10월경, 피해자 한소희를 비방할 목적으로 학교 익명 커뮤니티 및 반 친구들이 포함된 소셜미디어를 통해 '한소희가 학급 급식비 봉투를 훔쳐서 명품 지갑을 샀다'는 명백한 허위 사실을 공공연하게 유포하였습니다.<br><br>
          이로 인해 피해자 한소희 학생은 주변의 따가운 시선과 괴롭힘에 시달려 등교를 거부하는 등 극심한 정신적 피해를 입었습니다. 이는 정보통신망법상 허위사실 유포에 의한 사이버 명예훼손에 명백히 부합합니다.<br><br>
          검찰은 이번 재판을 통해 피고인이 범죄에 사용한 접속 IP 로그와 자발적인 목격자 대화방 캡처 등 적법한 증거들을 바탕으로 최민우의 범죄 행위를 낱낱이 입증할 것입니다. 배심원 여러분께서 사건의 실체와 피해자의 고통을 감안하시어 현명한 유죄 평결을 내려주시기를 당부드립니다."
        </div>
      </div>
    `
  },
  "prosecution-analyst": {
    title: "공격 모둠 - 증거 분석관 서면 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-prosecution); border-left: 3px solid var(--color-prosecution); padding-left: 6px;">적법 증거 매핑 및 논증 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>적법 증거 엄선</b>: 헌법적 절차(영장 발부) 또는 당사자 동의가 입증된 적법 증거들만을 골라야 논증의 효력이 유지됩니다.</li>
          <li><b>증거의 요건 증명</b>: 어떤 증거가 IP 특정성, 전파성(공연성), 범행 모의 정황을 가리키는지 논리적으로 기술합니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">주논증서 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main);">
          "본 검찰 측은 피고인의 범죄 행위를 입증하기 위해 적법하게 수집된 증거인 A1(대화방 캡처본), A3(영장 기반 IP 접속 로그), A5(목격자 진술서)를 활용해 주논증을 펼칩니다.<br><br>
          첫째, <b>A3(IP 접속 로그)</b>는 법관의 압수수색 영장을 거쳐 공식 입수된 증거입니다. 해당 익명 루머 글이 유포된 시각에 피고인 최민우의 컴퓨터 접속 IP가 명백히 일치함을 나타내므로, 범행을 실행한 주체가 최민우임을 입증하는 핵심 적법 증거입니다.<br><br>
          둘째, <b>A1(대화방 캡처본)</b>은 방 대화 참여자였던 제3자가 자발적으로 제공한 것으로 절차적 하자가 없습니다. 이 대화에서 최민우가 '소희를 쫓아내자며 소문을 퍼뜨리자'고 공모한 점은 범행의 고의성과 비방 목적을 명확히 보여줍니다.<br><br>
          셋째, <b>A5(목격자 진술서)</b> 역시 참고인이 자발적으로 서명 날인해 준 자료입니다. 피고인이 스마트폰으로 글을 작성하는 것을 옆자리에서 눈으로 직접 목격했다는 객관적 서술로, 피고인의 혐의를 더 이상 부인할 수 없게 만듭니다."
        </div>
      </div>
    `
  },
  "prosecution-strategist": {
    title: "공격 모둠 - 반박 전략가 서면 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-prosecution); border-left: 3px solid var(--color-prosecution); padding-left: 6px;">상대방 무죄 주장 무력화 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>상대방 알리바이 반박</b>: 변호인이 주장하는 기기 오작동(A7), 폰 분실 및 도용(A8) 주장의 허점을 찌릅니다.</li>
          <li><b>상식적인 인과관계 지적</b>: 기기가 고장 났거나 잃어버렸더라도 다른 모바일 네트워크 등으로 게시물이 유포된 정황이 존재할 수 있음을 상기시킵니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">재반박문 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main);">
          "피고인 측은 당시 컴퓨터 고장 접수증(A7)과 분실된 스마트폰 지문(A8)을 토대로 다른 사람에 의한 도용 범죄를 주장하지만, 이는 논리적 선후관계와 상식에 부합하지 않습니다.<br><br>
          첫째, <b>컴퓨터 메인보드 고장(A7)에 관하여</b>: 컴퓨터를 사용하지 못하더라도 피고인 최민우는 언제나 모바일 데이터망을 통해 스마트폰이나 태블릿으로 루머 글을 올릴 수 있었습니다. 유선 공유기나 PC의 고장이 글 작성의 물리적 불가능성을 뜻하진 않습니다.<br><br>
          둘째, <b>스마트폰 분실(A8) 및 도용에 관하여</b>: 최민우가 폰을 잃어버렸고 타인의 지문이 발견되었다고 하나, 목격자 증언(A5)에 따르면 사건 발생 전 피고인이 해당 스마트폰으로 글을 타이핑하는 장면이 확인되었습니다. 분실 신고 및 습득은 그 이후에 벌어진 일이므로, 범죄를 저지른 뒤 수사기관의 추적을 피하고자 고의로 폰을 투기해 유기하고 도용으로 위장한 것으로 판단됩니다. 따라서 변호인의 알리바이는 모순적입니다."
        </div>
      </div>
    `
  },
  "prosecution-finalist": {
    title: "공격 모둠 - 최종 변론가 서면 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-prosecution); border-left: 3px solid var(--color-prosecution); padding-left: 6px;">최종 구형 및 변론 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>종합 변론</b>: 영장 접속 데이터(A3) 및 목격자 진술(A5) 등 적법 증거들이 가리키는 유죄 심증을 최후로 강조합니다.</li>
          <li><b>엄격한 구형 선언</b>: 사이버 명예훼손의 심각성을 호소하며 배심원단에게 유죄 결정을 강력히 요구합니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">최종 변론 및 구형문 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main);">
          "존경하는 배심원 여러분, 최민우 피고인은 보이지 않는 익명성 뒤에 숨어 같은 반 피해자를 악질적인 절도범으로 묘사하며 조롱거리로 만들었습니다. 피고인은 교활하게 도용 영수증을 들이대며 혐의를 피하려 하지만, 법원의 적법한 영장을 거친 IP 추적 결과(A3)와 목격자의 진실한 눈(A5)은 오직 피고인 한 사람만을 범인으로 가리키고 있습니다.<br><br>
          학교라는 배움의 공간에서 억울한 가짜 소문으로 인격을 말살하는 가해자에게 엄중한 법의 심판이 내려져야만 우리 아이들의 일상이 안전할 수 있습니다. 이에 검찰은 피고인 최민우의 기소 혐의에 대해 단호히 유죄를 평결해주실 것을 탄원하며, 피고인에게 엄격한 형사 및 보호 처분을 구형합니다."
        </div>
      </div>
    `
  },
  "defense-speaker": {
    title: "방어 모둠 - 기조 답변인 서면 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-defense); border-left: 3px solid var(--color-defense); padding-left: 6px;">공소사실 전면 부인 및 답변 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>공소사실 부인</b>: 피고인은 비방글을 올리지 않았고 억울함을 강조하며 답변 요지를 전개합니다.</li>
          <li><b>위법수집증거 배제 예고</b>: 경찰이나 교사가 영장 없이 피고인의 사적 공간이나 물품을 강탈했음을 지적하며 절차의 위법성을 환기합니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">기조 답변서 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main);">
          "변호인은 피고인 최민우에 대한 공소사실을 전면 부인하며 무죄를 강력히 주장합니다. 피고인은 한소희에 대한 루머를 작성하거나 전파한 적이 없습니다.<br><br>
          검사 측은 피고인을 가해자로 단정하고 기소하였으나, 검사가 제시한 증거들 중 대다수는 법원 영장도 없이 교실 피고인의 사물함 잠금장치를 부수고 임의 강탈한 개인 수첩(A2)이거나, 당사자 동의 없이 무단 도청에 준하는 음성 녹취(A4), 그리고 밤샘 불법 구금 하에 회유와 협박으로 도출된 자백서(A6) 등 헌법상 영장주의와 적법절차를 정면 유린한 심각한 위법수집증거들입니다.<br><br>
          변호인은 위법수집증거 배제 원칙에 따라 위법하게 획득된 증거들의 증거능력을 전면 배제할 것을 청구하며, 피고인의 무죄를 배심원단 여러분과 함께 엄정히 증명해 나갈 것입니다."
        </div>
      </div>
    `
  },
  "defense-guard": {
    title: "방어 모둠 - 증거 감시관 이의제기 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-defense); border-left: 3px solid var(--color-defense); padding-left: 6px;">위법수집증거 배제 이의제기 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>절차적 문제 판별</b>: 검사 측이 제출한 증거 카드에 영장 미소지(사생활 침해), 타인 비밀대화 녹음, 강요에 의한 자백 팩트가 적혀 있는지 대조합니다.</li>
          <li><b>소명 헌법/법률 매칭</b>: 영장주의(헌법 12조 3항), 제3자 비밀녹음(통신비밀보호법 3조), 자백배제법칙(형사소송법 309조)을 연결해 이의제기 이유를 구체적으로 서술합니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">대표적인 이의제기 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main); display: flex; flex-direction: column; gap: 10px;">
          <div>
            <b>1. A2(사물함 압수 수첩)에 대한 이의제기 사유 (영장주의 위반)</b><br>
            <span style="color: var(--text-main);">"담임교사는 수사기관이 아님에도 불구하고 법관의 수색 영장이나 소유자의 임의 동의를 받지 않고, 피고인 최민우의 사물함 자물쇠를 부수고 들어가 개인 일기가 담긴 수첩을 임의 압수했습니다. 이는 헌법 제12조 제3항 영장주의를 위반하여 수집된 대표적 위법수집증거이므로 형사소송법 제308조의2에 의거해 증거 배제되어야 합니다."</span>
          </div>
          <hr style="border-color: rgba(37, 99, 235, 0.15);">
          <div>
            <b>2. A4(카페 도청 녹음)에 대한 이의제기 사유 (통신비밀보호법 위반)</b><br>
            <span style="color: var(--text-main);">"이 녹음 파일은 대화 당사자가 아닌 제3자가 카페 옆자리에서 동의 없이 스마트폰을 켜 무단으로 수집한 타인 간의 대화입니다. 통신비밀보호법 제3조 제1항에 따르면 공개되지 아니한 타인 간의 대화를 녹음하는 것은 금지되어 있고 이를 위반하여 수집된 증거는 증거능력이 없으므로 법적 효력이 전면 부인되어야 합니다."</span>
          </div>
          <hr style="border-color: rgba(37, 99, 235, 0.15);">
          <div>
            <b>3. A6(자백서)에 대한 이의제기 사유 (자백배제법칙 위반)</b><br>
            <span style="color: var(--text-main);">"피고인이 임의로 작성한 것이 아니라, 경찰서 뒷방에서 부당하게 압수물품을 돌려받고 싶으면 빨리 사인하라는 형사의 기망과 밤샘 감금 협박을 견디지 못하고 강제로 받아낸 자백입니다. 이는 형사소송법 제309조(자백배제법칙)에 의거하여 피고인의 임의성이 결여된 자백이므로 유죄의 입증 증거로 사용할 수 없습니다."</span>
          </div>
        </div>
      </div>
    `
  },
  "defense-arguer": {
    title: "방어 모둠 - 방어 논증가 서면 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-defense); border-left: 3px solid var(--color-defense); padding-left: 6px;">적법 방어 증거 채택 및 변론 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>무죄 정황과 알리바이 연동</b>: 피고인에게 유리한 적법 증거(기기 고장 A7, 분실/도용 A8)를 활용해 무죄 논리를 수립합니다.</li>
          <li><b>합리적 의심 제기</b>: 검사 측의 IP 증거가 왜 도용에 의해 발생했을 개연성이 있는지 정황을 엮어 입증합니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">무죄 주논증서 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main);">
          "변호인은 피고인의 무죄를 뒷받침할 강력한 적법 방어 증거로 A7(기기 고장 접수증)과 A8(타인이 로그인한 스마트폰 회수증)을 제출하며 주논증을 수립합니다.<br><br>
          첫째, <b>A7(컴퓨터 수리 내역서)</b>에 입증되듯, 익명 글이 올라간 시각에 피고인 최민우의 가정용 컴퓨터 메인보드는 전소 상태였고 수리업체에 맡겨져 있었습니다. 이는 검사 측이 제시한 IP 추적 기록(A3)이 무선 대역 탈취 또는 계정 무단 도용 등 불완전한 원인에 의해 추출되었을 합리적 가능성을 보여줍니다.<br><br>
          둘째, <b>A8(분실 및 도용 스마트폰 증빙)</b>에 따르면, 피고인이 사건 전날 분실 신고를 낸 스마트폰이 당일 학교 근처에서 타인의 손에 쥐어져 있었음이 경찰 순찰 보고서와 감정 지문(피고인 외의 지문)을 통해 객관적으로 입증되었습니다. 누군가가 분실폰 속 로그인 세션을 무단 도용하여 피고인의 아이디로 익명 글을 썼음이 명백하므로, 공소사실은 기각되고 최민우 학생은 무죄로 평결되어야 합니다."
        </div>
      </div>
    `
  },
  "defense-finalist": {
    title: "방어 모둠 - 최종 변론가 서면 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-defense); border-left: 3px solid var(--color-defense); padding-left: 6px;">최종 변론 및 피고인 구제 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 인물과 팩트로 바꾸어 작성하세요!</li>
          <li><b>위법수집증거 법칙 재환기</b>: 절차 위반 증거인 사물함 수첩(A2), 카페 녹취(A4), 자백서(A6)가 배제되었음을 환기하여 유죄 심증을 부숩니다.</li>
          <li><b>합리적 의심 호소</b>: 도용 개연성(A7, A8)을 요약하여 합리적인 의심에 따른 무죄를 강력히 탄원합니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">최종 변론서 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main);">
          "존경하는 배심원 여러분, 그리고 재판장님. 기소의 정당성은 절차의 정당성에서 비롯됩니다. 검찰은 피고인의 무단 사물함 강탈 수첩(A2), 동의 없는 불법 대화 녹음(A4), 강제 협박 자백서(A6)를 법정에 내어놓으려 했으나, 법의 절차를 위반한 탓에 증거 배제 처분을 받았습니다.<br><br>
          남은 정황인 IP 추적마저도, 당시 피고인의 PC 미작동 영수증(A7)과 분실된 폰의 도용 감정서(A8)를 통해 제3자가 기기와 계정을 악용해 저지른 소행임이 뚜렷해졌습니다. '열 명의 범인을 놓치더라도 단 한 명의 억울한 죄인을 만들지 말라'는 원칙을 환기해주시어, 부디 최민우 피고인에게 당당히 무죄를 선고하여 주시기를 간곡히 호소합니다."
        </div>
      </div>
    `
  },
  "juror-verdict": {
    title: "배심원단 - 평결 소명서 작성 예시 & 가이드 (다른 사건 예시)",
    content: `
      <div class="example-guide-box">
        <h4 style="color: var(--color-jury); border-left: 3px solid var(--color-jury); padding-left: 6px;">평결 요지 소명서 작성 가이드</h4>
        <ul style="padding-left: 20px; font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 12px;">
          <li><b>[주의]</b> 본 예시는 다른 가상 사건(급식비 도난 소문 사건)에 관한 것입니다. 이를 참고하여 현재 다루고 있는 '강지민 단톡방 사건'의 법리와 증거에 기초해 소명서를 작성하세요!</li>
          <li><b>위법수집증거 배제 원칙의 준수</b>: 이의제기가 수용(인용)되어 법적으로 배제된 증거들은 절대로 판단 기준으로 삼지 말아야 합니다.</li>
          <li><b>합리적 의심 해결 여부</b>: 검찰의 적법 증거가 유죄를 충분히 증명했는지, 혹은 변호인의 반증이 타당했는지를 바탕으로 한 줄 이유를 씁니다.</li>
        </ul>
        
        <h4 style="color: var(--accent-blue); border-left: 3px solid var(--accent-blue); padding-left: 6px; margin-top: 15px;">배심원 평결 소명 작성 예시 (참고용 다른 사건: 최민우 사건)</h4>
        <div style="background: var(--bg-tertiary); border: 1px solid rgba(37, 99, 235, 0.15); padding: 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: var(--text-main); display: flex; flex-direction: column; gap: 8px;">
          <div>
            <span style="font-weight: bold; color: var(--color-defense);">⚖️ [유죄 평결을 내릴 때 소명 예시]</span><br>
            <span style="color: var(--text-main); font-style: italic;">"영장 없는 수첩 및 임의성 없는 자백서가 배제된 채 재판이 진행되었으나, 법원의 공식 압수수색 영장(A3)을 거친 IP 데이터가 명확하고 피고인이 대나무숲 글을 올리는 것을 확인한 목격자의 자발적 진술서(A5) 등 남은 적법 증거들로 유죄 혐의가 입증되므로 유죄로 판단함."</span>
          </div>
          <hr style="border-color: rgba(37, 99, 235, 0.15);">
          <div>
            <span style="font-weight: bold; color: var(--color-jury);">⚖️ [무죄 평결을 내릴 때 소명 예시]</span><br>
            <span style="color: #0f172a; font-style: italic;">"가장 직접적인 증적이 포함되었던 사물함 수색 수첩(A2)과 녹음파일(A4)이 절차 위법으로 배제되었고, 피고인의 PC 수리 내역(A7)과 타인 지문이 감지된 폰 분실 기록(A8)을 비추어 볼 때 타인에 의한 해킹 도용의 합리적 의심을 전적으로 해소할 수 없어 무죄로 평결함."</span>
          </div>
        </div>
      </div>
    `
  }
};

// ⑩ 작성 예시 및 법리 가이드 모달 띄우기 함수
function showExampleGuide(role) {
  const guide = EXAMPLES_AND_GUIDES[role];
  if (!guide) return;

  document.getElementById("example-guide-title").innerHTML = `📋 ${guide.title}`;
  document.getElementById("example-guide-content").innerHTML = guide.content;
  document.getElementById("example-guide-modal").style.display = "flex";
}

function closeExampleGuideModal() {
  document.getElementById("example-guide-modal").style.display = "none";
}

// 🔒 교사용 PIN 패스코드 시각화 입력기 구현
function initPinEntry() {
  const pinInput = document.getElementById("teacher-pin");
  const cells = [
    document.getElementById("pin-cell-0"),
    document.getElementById("pin-cell-1"),
    document.getElementById("pin-cell-2"),
    document.getElementById("pin-cell-3")
  ];

  if (!pinInput || !cells[0]) return;

  // 인풋 값 변경 시 시각적 셀 업데이트
  pinInput.addEventListener("input", () => {
    const val = pinInput.value.replace(/[^0-9]/g, ""); // 숫자만 허용
    pinInput.value = val.substring(0, 4); // 최대 4자리 제한

    for (let i = 0; i < 4; i++) {
      const cell = cells[i];
      if (i < pinInput.value.length) {
        cell.classList.add("filled");
        cell.classList.remove("active");
      } else if (i === pinInput.value.length) {
        cell.classList.add("active");
        cell.classList.remove("filled");
      } else {
        cell.classList.remove("filled", "active");
      }
    }
  });

  // 인풋 포커스 시 첫 번째 미입력 셀에 active 클래스 적용
  pinInput.addEventListener("focus", () => {
    const len = pinInput.value.length;
    for (let i = 0; i < 4; i++) {
      if (i === len) {
        cells[i].classList.add("active");
      } else {
        cells[i].classList.remove("active");
      }
    }
  });

  // 인풋 포커스 아웃 시 active 클래스 제거
  pinInput.addEventListener("blur", () => {
    for (let i = 0; i < 4; i++) {
      cells[i].classList.remove("active");
    }
  });
}

function focusPinInput() {
  const pinInput = document.getElementById("teacher-pin");
  if (pinInput) pinInput.focus();
}
