let CLIENT_ID;
let CLIENT_KEY;

document.addEventListener("DOMContentLoaded", async function () {

	const sidebar = document.getElementById("sidebar");
	const sidebarToggle = document.getElementById("sidebar-toggle");
	const sidebarOverlay = document.createElement("div");
	sidebarOverlay.id = "sidebar-overlay";
	document.body.appendChild(sidebarOverlay);

	sidebarToggle.addEventListener("click", function () {
		sidebar.classList.add("active");
		sidebarOverlay.classList.add("active");
	});
	sidebarOverlay.addEventListener("click", function () {
		sidebar.classList.remove("active");
		sidebarOverlay.classList.remove("active");
	});

	const app = document.getElementById("app");
	const mainContainer = document.getElementById("main-container");
	mainContainer.addEventListener("scroll", function () {
		if (mainContainer.scrollTop > 20) {
			app.classList.add("scrolled");
		} else {
			app.classList.remove("scrolled");
		}
	});

	const observer = new MutationObserver(() => {
		const calendarEl = document.getElementById("calendar");
		if (calendarEl && !calendarEl.dataset.initialized) {
			calendarEl.dataset.initialized = "true"; // 중복 방지
			console.log("✅ Calendar detected, initializing...");

			window.appCalendar = new FullCalendar.Calendar(calendarEl, {
				initialView: "dayGridMonth",
				locale: "ko",
				selectable: true,
				fixedWeekCount: false,
				headerToolbar: false,
				dayHeaderFormat: {
					weekday: 'long'
				},
				events: function(info, successCallback, failureCallback) {
					fetch("https://script.google.com/macros/s/AKfycbzTSYkkjy1YUNI_aFxwMoXRKG7XEcVweakV9RQqMww38pi-iomUDacWuf6EQOewHLOSgg/exec")
						.then(res => res.json())
						.then(data => successCallback(data))
						.catch(err => {
							console.error("Failed to load events", err);
							failureCallback(err);
						});
				},
				dateClick: function (info) {
					$("#selectedDate").val(info.dateStr);
					$("#eventModal").modal("show");
				},
				dayCellContent: function (info) {
					let number = document.createElement("a");
					number.classList.add("fc-daygrid-day-number");
					number.innerHTML = info.dayNumberText.replace("일", "");
					if (info.view.type === "dayGridMonth") {
						return {
							html: number.outerHTML
						};
					}
					return {
						domNodes: []
					};
				},
			});
			window.appCalendar.render();
		}
	});

	// `#app` 내부 변화를 감지 (동적 HTML 변경 감지)
	observer.observe(document.getElementById("app"), {childList: true, subtree: true});

	const saveBtn = document.getElementById("saveEvent");
	if (saveBtn) {
		saveBtn.addEventListener("click", function() {
			const dateStr = document.getElementById("selectedDate").value;
			const reason = document.getElementById("reasonInput").value;
			const savedUserStr = localStorage.getItem("dinerUserInfo");
			
			if (!savedUserStr) {
				alert("로그인이 필요합니다.");
				return;
			}
			if (!reason.trim()) {
				alert("이유를 입력해주세요.");
				return;
			}
			
			const userInfo = JSON.parse(savedUserStr);
			const payload = {
				action: "save",
				date: dateStr,
				name: userInfo.name,
				reason: reason
			};
			
			fetch("https://script.google.com/macros/s/AKfycbzTSYkkjy1YUNI_aFxwMoXRKG7XEcVweakV9RQqMww38pi-iomUDacWuf6EQOewHLOSgg/exec", {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify(payload)
			})
			.then(res => res.json())
			.then(data => {
				if(data.success) {
					// 부트스트랩 모달 닫기
					const modalEl = document.getElementById("eventModal");
					const modal = bootstrap.Modal.getInstance(modalEl);
					if (modal) modal.hide();
					
					document.getElementById("reasonInput").value = "";
					
					if (window.appCalendar) {
						window.appCalendar.refetchEvents();
					}
				} else {
					alert("저장 실패: " + data.error);
				}
			})
			.catch(err => {
				console.error(err);
				alert("저장 중 오류가 발생했습니다.");
			});
		});
	}
});


function parseJwt(token) {
	return JSON.parse(atob(token.split('.')[1]));
}


window.onload = function () {
	const savedUserStr = localStorage.getItem("dinerUserInfo");
	if (savedUserStr) {
		const userInfo = JSON.parse(savedUserStr);
		document.getElementById("profile-img").src = userInfo.picture;
		document.getElementById("user-name").textContent = userInfo.name;
		document.getElementById("login-btn").classList.add("hidden");
		document.getElementById("user-info").classList.remove("hidden");
	}

	google.accounts.id.initialize({
		client_id: "143675790537-5f95f3pftgbtk5c72higjtq4bsimukfc.apps.googleusercontent.com", // 하드코딩된 client_id
		callback: handleCredentialResponse
	});

	document.getElementById("login-btn").addEventListener("click", function () {
		google.accounts.id.prompt();
	});

	const logoutBtn = document.getElementById("logout-btn");
	if (logoutBtn) {
		logoutBtn.addEventListener("click", function() {
			localStorage.removeItem("dinerUserInfo");
			location.reload();
		});
	}
};

function handleCredentialResponse(response) {
	const idToken = response.credential;
	
	// GAS 응답과 무관하게 먼저 UI 업데이트 및 로컬 스토리지 저장을 진행합니다.
	updateUserProfile(idToken);
	
	fetch("https://script.google.com/macros/s/AKfycbzTSYkkjy1YUNI_aFxwMoXRKG7XEcVweakV9RQqMww38pi-iomUDacWuf6EQOewHLOSgg/exec", {
		method: "POST",
		headers: { "Content-Type": "text/plain;charset=utf-8" },
		body: JSON.stringify({ action: "login", idToken: idToken })
	})
		.then(res => res.json())
		.then(data => {
			if (data.client_secret) {
				console.log("GAS Login Check Success. Client Secret:", data.client_secret);
			} else {
				console.error("GAS Login Failed:", data.error);
			}
		})
		.catch(error => console.error("GAS Fetch Error:", error));
}

function updateUserProfile(idToken) {
	const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`;

	fetch(url)
		.then(res => res.json())
		.then(userInfo => {
			localStorage.setItem("dinerUserInfo", JSON.stringify(userInfo));

			document.getElementById("profile-img").src = userInfo.picture;
			document.getElementById("user-name").textContent = userInfo.name;

			document.getElementById("login-btn").classList.add("hidden");
			document.getElementById("user-info").classList.remove("hidden");
		})
		.catch(error => console.error("Failed to fetch user info:", error));
}