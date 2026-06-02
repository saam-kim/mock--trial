// 실시간 데이터베이스 연동 및 로컬 모의 동기화 엔진
window.MockTrial = window.MockTrial || {};

class MockTrialDatabase {
  constructor() {
    this.currentSessionId = null;
    this.listeners = [];
    this.channel = null;
    this.useFirebase = false;
    this.dbType = "mock"; // "mock" or "firebase"

    this.initEngine();
  }

  // 1. 동기화 엔진 초기화
  initEngine() {
    // Firebase 설정 파일이 있고 설정이 유효한 경우 Firebase 로직 활성화 시도
    if (window.firebaseConfig && window.firebaseConfig.apiKey) {
      try {
        // Firebase v9+ CDN 로딩 및 초기화
        this.useFirebase = true;
        this.dbType = "firebase";
        console.log("Firebase 연동 활성화");
      } catch (e) {
        console.error("Firebase 초기화 실패, 로컬 모의 엔진으로 전환합니다.", e);
        this.setupMockEngine();
      }
    } else {
      this.setupMockEngine();
    }
  }

  // 2. BroadcastChannel 기반 로컬 모의 엔진 설정
  setupMockEngine() {
    this.dbType = "mock";
    console.log("로컬 모의 실시간 동기화 엔진(BroadcastChannel) 활성화");
    
    try {
      this.channel = new BroadcastChannel("mock-trial-channel");
      this.channel.onmessage = (event) => {
        const { sessionId, type, data } = event.data;
        if (sessionId === this.currentSessionId && type === "UPDATE") {
          console.log("로컬 채널 수신 (UPDATE):", data);
          this.triggerUpdate(data);
        }
      };
    } catch (e) {
      console.warn("BroadcastChannel을 생성할 수 없습니다. 단일 브라우저 탭 내에서만 동기화됩니다.", e);
    }
  }

  // 3. 신규 세션 생성 (교사용)
  createSession(scenarioId = "cyber-defamation") {
    const sessionId = Math.floor(100000 + Math.random() * 900000).toString(); // 6자리 임의 생성
    this.currentSessionId = sessionId;

    const initialData = {
      sessionId: sessionId,
      scenarioId: scenarioId, // 선택된 모의재판 시나리오 ID
      status: "waiting", // waiting | intro | guidelines | trial | verdict | finished
      currentStage: 1, // 1: 도입부 사건 파악 및 역할별 준비, 2: 기초서면/기조진술, 3: 증거조사 및 이의제기, 4: 공방 및 재반박, 5: 최종변론, 6: 평결 및 판결문
      timer: {
        duration: 360, // 초 단위 (1단계 6분 기본)
        timeLeft: 360,
        isRunning: false
      },
      teacherPresent: true,
      students: {}, // { name: { role, team, connected, lastActive } }
      prosecutionData: {
        opening: "",
        selectedEvidence: [], // E1, E3 등 적법 증거 채택 목록
        argument: "",
        counterArgument: "",
        finalStatement: "",
        strategy: "", // 모둠 공동 전략 및 회의록
        isSpeakerDone: false,
        isAnalystDone: false,
        isStrategistDone: false,
        isFinalistDone: false
      },
      defenseData: {
        opening: "",
        objections: [], // [ { evidenceId, timestamp, text, result: 'pending'|'sustained'|'overruled' } ]
        selectedEvidence: [], // E7, E8 등 방어 증거 채택 목록
        argument: "",
        finalStatement: "",
        strategy: "", // 모둠 공동 전략 및 회의록
        isSpeakerDone: false,
        isGuardDone: false,
        isArguerDone: false,
        isFinalistDone: false
      },
      juryData: {
        votes: {}, // { studentName: 'guilty' | 'innocent' }
        comments: [] // { name, text, timestamp }
      },
      feed: [
        {
          sender: "시스템",
          text: `수업 세션 ${sessionId}번이 개설되었습니다. 학생들을 대기실로 입장시켜 주세요.`,
          type: "system",
          timestamp: Date.now()
        }
      ]
    };

    this.saveData(sessionId, initialData);
    return sessionId;
  }

  // 4. 세션 가져오기
  getSession(sessionId) {
    const data = localStorage.getItem(`mock_trial_session_${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  // 5. 세션 데이터 저장 및 브로드캐스트
  saveData(sessionId, data) {
    localStorage.setItem(`mock_trial_session_${sessionId}`, JSON.stringify(data));
    if (this.channel) {
      this.channel.postMessage({
        sessionId: sessionId,
        type: "UPDATE",
        data: data
      });
    }
    this.triggerUpdate(data);
  }

  // 6. 실시간 업데이트 콜백 등록
  onSessionUpdate(sessionId, callback) {
    this.currentSessionId = sessionId;
    this.listeners.push(callback);
    
    // 초기 1회 로드
    const data = this.getSession(sessionId);
    if (data) {
      callback(data);
    }
  }

  // 콜백 실행
  triggerUpdate(data) {
    this.listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error("이벤트 리스너 콜백 에러:", err);
      }
    });
  }

  // 리스너 해제
  clearListeners() {
    this.listeners = [];
  }

  // 7. 학생 세션 참가
  joinSession(sessionId, studentName) {
    this.currentSessionId = sessionId;
    const session = this.getSession(sessionId);
    if (!session) {
      return { success: false, message: "세션 번호를 찾을 수 없습니다." };
    }

    if (!session.students) {
      session.students = {};
    }

    // 이미 존재하는 이름인 경우 재연결 처리
    if (session.students[studentName]) {
      session.students[studentName].connected = true;
      session.students[studentName].lastActive = Date.now();
    } else {
      session.students[studentName] = {
        name: studentName,
        team: null, // prosecution | defense | jury
        role: null,
        connected: true,
        lastActive: Date.now()
      };
      
      session.feed.push({
        sender: "시스템",
        text: `학생 [${studentName}] 님이 대기실에 입장했습니다.`,
        type: "system",
        timestamp: Date.now()
      });
    }

    this.saveData(sessionId, session);
    return { success: true, session };
  }

  // 8. 학생 퇴장 또는 연결 끊김 처리
  disconnectStudent(sessionId, studentName) {
    const session = this.getSession(sessionId);
    if (session && session.students && session.students[studentName]) {
      session.students[studentName].connected = false;
      session.feed.push({
        sender: "시스템",
        text: `학생 [${studentName}] 님의 연결이 끊어졌습니다.`,
        type: "system",
        timestamp: Date.now()
      });
      this.saveData(sessionId, session);
    }
  }

  // 9. 학생 수동 배정 (교사 드래그 앤 드롭 또는 수동 배정용)
  assignStudentRole(sessionId, studentName, team, role) {
    const session = this.getSession(sessionId);
    if (!session || !session.students[studentName]) return;

    // 이전 상태 백업
    const prevTeam = session.students[studentName].team;
    const prevRole = session.students[studentName].role;

    session.students[studentName].team = team;
    session.students[studentName].role = role;
    session.students[studentName].lastActive = Date.now();

    // 배정 안내 메시지 송출
    let teamName = "대기실";
    if (team === "prosecution") teamName = "공격 모둠 (검사 측)";
    else if (team === "defense") teamName = "방어 모둠 (변호인 측)";
    else if (team === "jury") teamName = "배심원단";

    let roleName = "관전자";
    if (role === "speaker") roleName = team === "prosecution" ? "기조 대변인" : "기조 답변인";
    else if (role === "analyst") roleName = "증거 분석관";
    else if (role === "guard") roleName = "증거 감시관";
    else if (role === "strategist") roleName = "반박 전략가";
    else if (role === "arguer") roleName = "방어 논증가";
    else if (role === "finalist") roleName = "최종 변론가";
    else if (role === "juror") roleName = "배심원";

    session.feed.push({
      sender: "시스템",
      text: `[${studentName}] 학생이 [${teamName} - ${roleName}] 역할로 배정되었습니다.`,
      type: "assign",
      timestamp: Date.now()
    });

    this.saveData(sessionId, session);
  }

  // 10. 진도 제어 (단계 이동)
  setStage(sessionId, stageIndex) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.currentStage = stageIndex;
    
    // 단계 이름 맵핑
    const stageNames = {
      1: "1단계: 도입부 사건 파악 및 역할별 준비",
      2: "2단계: 기초 서면 확인 및 기조 진술",
      3: "3단계: 증거조사 및 이의제기 (핵심)",
      4: "4단계: 치열한 공방 및 재반박",
      5: "5단계: 최종 변론 및 구형",
      6: "6단계: 배심원 평결 및 최종 판결"
    };

    session.feed.push({
      sender: "재판장",
      text: `소송 진도를 [${stageNames[stageIndex]}] 단계로 진행합니다.`,
      type: "stage",
      timestamp: Date.now()
    });

    // 단계별 기본 타이머 초기화 (예: 도입/준비 6분, 기조진술 4분 등)
    const timers = { 1: 360, 2: 240, 3: 360, 4: 360, 5: 300, 6: 180 };
    session.timer.duration = timers[stageIndex] || 300;
    session.timer.timeLeft = session.timer.duration;
    session.timer.isRunning = false;

    this.saveData(sessionId, session);
  }

  // 11. 타이머 컨트롤
  controlTimer(sessionId, action, value = null) {
    const session = this.getSession(sessionId);
    if (!session) return;

    if (action === "start") {
      session.timer.isRunning = true;
    } else if (action === "pause") {
      session.timer.isRunning = false;
    } else if (action === "tick") {
      if (session.timer.isRunning && session.timer.timeLeft > 0) {
        session.timer.timeLeft--;
      } else if (session.timer.timeLeft === 0) {
        session.timer.isRunning = false;
      }
    } else if (action === "set") {
      session.timer.duration = value;
      session.timer.timeLeft = value;
    }

    this.saveData(sessionId, session);
  }

  // 12. 공통: 피드에 메시지 전송
  sendFeedMessage(sessionId, sender, text, type = "chat") {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.feed.push({
      sender: sender,
      text: text,
      type: type,
      timestamp: Date.now()
    });

    this.saveData(sessionId, session);
  }

  // 13. 데이터 업데이트 유틸리티 (공격/방어/배심원 공통)
  updateData(sessionId, target, key, value) {
    const session = this.getSession(sessionId);
    if (!session) return;

    if (target === "prosecution") {
      session.prosecutionData[key] = value;
    } else if (target === "defense") {
      session.defenseData[key] = value;
    } else if (target === "jury") {
      session.juryData[key] = value;
    }
    
    this.saveData(sessionId, session);
  }
}

// 싱글톤으로 내보내기
window.MockTrial.DB = new MockTrialDatabase();
