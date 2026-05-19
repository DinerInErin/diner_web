let CLIENT_ID;
let CLIENT_KEY;
window.isFirstLoad = true; // 최초 진입 시 로딩 상태 관리를 위한 전역 변수
window.needsServerSync = true; // 서버 동기화가 필요한지 여부 플래그

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
		const scheduleEl = document.getElementById("schedule");
		if (scheduleEl && !scheduleEl.dataset.initialized) {
			scheduleEl.dataset.initialized = "true";
			console.log("📅 Schedule Page detected, initializing...");
			initSchedulePage();
		}

		const calendarEl = document.getElementById("calendar");
		if (calendarEl && !calendarEl.dataset.initialized) {
			calendarEl.dataset.initialized = "true"; // 중복 방지
			console.log("✅ Calendar detected, initializing...");

			window.appCalendar = new FullCalendar.Calendar(calendarEl, {
				initialView: "dayGridMonth",
				locale: "ko",
				selectable: true,
				selectMirror: true,
				unselectAuto: true,
				longPressDelay: 250, // 모바일에서 0.25초 꾹 누르면 드래그 선택 모드로 진입
				fixedWeekCount: false,
				headerToolbar: false,
				dayHeaderFormat: {
					weekday: 'short'
				},
				datesSet: function (dateInfo) {
					// 뷰가 변경되거나 날짜 범위가 설정될 때마다 상단 타이틀 갱신
					const titleEl = document.getElementById("calendarTitle");
					if (titleEl && window.appCalendar) {
						titleEl.textContent = window.appCalendar.view.title;
					}
				},
				events: function (info, successCallback, failureCallback) {
					// 1. 로컬 캐시를 읽어와 즉시 렌더링 (체감 속도 0ms!)
					const cachedDataStr = localStorage.getItem("dinerEventsCache");
					const hasCache = !!cachedDataStr;

					let cachedEvents = [];
					if (hasCache) {
						try {
							cachedEvents = JSON.parse(cachedDataStr);
							successCallback(cachedEvents);
							// 캐시 렌더링 완료 즉시 5인 이상 배지 렌더링
							setTimeout(() => { renderConfirmedDateBadges(cachedEvents); }, 50);
						} catch (e) {
							console.error("Cache parsing error", e);
						}
					}

					// 1.5. 진행 중인 모든 변경사항(activeMutationsCount > 0)이 완전히 처리될 때까지 백그라운드 서버 패치를 차단하여 레이스 컨디션을 예방합니다.
					if ((window.activeMutationsCount || 0) > 0) {
						return;
					}

					// 서버 동기화가 불필요한 경우 네트워크 조회를 생략합니다.
					if (!window.needsServerSync) {
						return;
					}

					// 서버 호출 직전에 플래그를 꺼서 무한 루프를 방지합니다.
					window.needsServerSync = false;

					// 최초 진입 시(isFirstLoad = true)에는 사용자에게 동기화 진행 상황을 정밀하게 알려줍니다.
					if (window.isFirstLoad) {
						showLoadingToast("캘린더 최신 정보를 동기화하는 중입니다...");
					} else if (!hasCache) {
						showLoadingToast("캘린더 데이터를 로딩 중입니다...");
					}

					fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec")
						.then(res => res.json())
						.then(data => {
							let eventsArray = [];
							let schedulesArray = [];
							if (data && data.events) {
								eventsArray = data.events;
								schedulesArray = data.schedules;
								// 스케줄도 로컬 캐시에 저장
								localStorage.setItem("dinerSchedulesCache", JSON.stringify(schedulesArray));
							} else if (Array.isArray(data)) {
								eventsArray = data;
							}

							// 이벤트를 로컬 캐시에 저장
							localStorage.setItem("dinerEventsCache", JSON.stringify(eventsArray));

							// 최초 진입 동기화 피드백 종료
							if (window.isFirstLoad) {
								window.isFirstLoad = false; // 최초 로드 완료 플래그 리셋
								hideLoadingToast("캘린더 데이터 동기화 완료!");
							} else if (!hasCache) {
								hideLoadingToast("캘린더 데이터 로딩 완료!");
							}

							// 3. 서버 정합성을 보장하기 위해 한 번 더 동기 렌더링 호출
							if (window.appCalendar) {
								window.appCalendar.refetchEvents();
							}
						})
						.catch(err => {
							console.error("Failed to load events", err);
							// 실패 시 다음 기회에 재시도할 수 있도록 동기화 플래그 복구
							window.needsServerSync = true;
							if (window.isFirstLoad) {
								window.isFirstLoad = false;
								hideLoadingToast();
								showToast("캘린더 데이터를 동기화하지 못했습니다.", "danger");
							} else if (!hasCache) {
								hideLoadingToast();
								showToast("캘린더 데이터를 가져오지 못했습니다.", "danger");
							}
							failureCallback(err);
						});
				},
				select: function (selectionInfo) {
					handleDateRangeSelect(selectionInfo.startStr, selectionInfo.endStr);
				},
				eventClick: function (info) {
					const dateStr = info.event.startStr.split('T')[0];
					handleDateOrEventClick(dateStr);
				},
				eventContent: function (arg) {
					let profileImage = arg.event.extendedProps.profileImage;
					const eventOwner = arg.event.extendedProps.originalName || arg.event.extendedProps.name || arg.event.title;

					// 내 일정일 경우 시트에 이미지가 없더라도 로컬 스토리지의 구글 이미지 또는 커스텀 이미지로 폴백 표시
					if (!profileImage) {
						const savedUserStr = localStorage.getItem("dinerUserInfo");
						if (savedUserStr) {
							const userInfo = JSON.parse(savedUserStr);
							const currentNickname = localStorage.getItem("dinerUserNickname");
							if (eventOwner === userInfo.name || eventOwner === currentNickname) {
								profileImage = localStorage.getItem("dinerUserProfileImage") || userInfo.picture;
							}
						}
					}

					profileImage = profileImage || "resource/image/default-profile.png";
					const memo = arg.event.extendedProps.reason || "";

					let imgHtml = `<img src="${profileImage}" class="rounded-circle border border-2 border-white shadow-sm" style="width:22px; height:22px; object-fit:cover; margin: 2px;" data-bs-toggle="tooltip" data-bs-placement="top" title="${memo}">`;

					return { html: imgHtml };
				},
				eventDidMount: function (info) {
					const tooltipEl = info.el.querySelector('[data-bs-toggle="tooltip"]');
					if (tooltipEl && info.event.extendedProps.reason) {
						const tooltip = new bootstrap.Tooltip(tooltipEl, {
							trigger: 'hover focus'
						});

						// 모바일 롱프레스(꾹 누르기)로 툴팁 감지
						let pressTimer;
						tooltipEl.addEventListener('touchstart', function (e) {
							pressTimer = setTimeout(function () {
								window.isLongPressActive = true;
								tooltip.show();
								// 2.5초 뒤 자동으로 툴팁 닫기
								setTimeout(() => { tooltip.hide(); }, 2500);
							}, 600); // 0.6초 꾹 누르기
						}, { passive: true });

						tooltipEl.addEventListener('touchend', function (e) {
							clearTimeout(pressTimer);
							if (window.isLongPressActive) {
								// 롱프레스가 끝난 후 잠깐 딜레이를 주어 일반 클릭 이벤트(토글) 방지
								setTimeout(() => {
									window.isLongPressActive = false;
								}, 300);
							}
						}, { passive: true });

						tooltipEl.addEventListener('touchmove', function (e) {
							clearTimeout(pressTimer);
						}, { passive: true });
					}
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

			// 커스텀 헤더 버튼 이벤트 바인딩
			const prevBtn = document.getElementById("prevMonthBtn");
			const nextBtn = document.getElementById("nextMonthBtn");
			if (prevBtn) {
				prevBtn.addEventListener("click", () => {
					window.appCalendar.prev();
				});
			}
			if (nextBtn) {
				nextBtn.addEventListener("click", () => {
					window.appCalendar.next();
				});
			}
		}
	});

	// `#app` 내부 변화를 감지 (동적 HTML 변경 감지)
	observer.observe(document.getElementById("app"), { childList: true, subtree: true });

	const saveBtn = document.getElementById("saveEvent");
	if (saveBtn) {
		saveBtn.addEventListener("click", function () {
			const reason = document.getElementById("reasonInput").value;
			const savedUserStr = localStorage.getItem("dinerUserInfo");

			if (!savedUserStr) {
				showToast("로그인이 필요합니다.", "danger");
				return;
			}

			// 동작 피드백을 위해 모달을 즉시 닫습니다.
			const modalEl = document.getElementById("eventModal");
			const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
			if (modal) modal.hide();

			const userInfo = JSON.parse(savedUserStr);
			const savedNickname = localStorage.getItem("dinerUserNickname");
			const savedProfileImage = localStorage.getItem("dinerUserProfileImage");

			// 일괄 저장할 날짜 목록 결정
			let datesToSave = [];
			if (window.dragSelectedDates && window.dragSelectedDates.length > 0) {
				datesToSave = window.dragSelectedDates;
				window.dragSelectedDates = null; // 사용 후 리셋
			} else {
				datesToSave = [document.getElementById("selectedDate").value];
			}

			// 서버 갱신 중 카운터 증가 (캘린더 백그라운드 패치를 일시 차단)
			window.activeMutationsCount = (window.activeMutationsCount || 0) + 1;

			// Optimistic Update: 로컬 캐시에 저장 체크 즉시 반영
			const cachedDataStr = localStorage.getItem("dinerEventsCache");
			if (cachedDataStr) {
				try {
					let cachedEvents = JSON.parse(cachedDataStr);
					datesToSave.forEach(dateStr => {
						const exists = cachedEvents.some(ev => ev.start === dateStr && (ev.originalName === userInfo.name || ev.title === userInfo.name));
						if (!exists) {
							cachedEvents.push({
								title: savedNickname || userInfo.name,
								start: dateStr,
								originalName: userInfo.name,
								nickname: savedNickname || "",
								profileImage: savedProfileImage || userInfo.picture,
								reason: reason
							});
						}
					});
					localStorage.setItem("dinerEventsCache", JSON.stringify(cachedEvents));
				} catch (e) {
					console.error(e);
				}
			}

			// 즉각 달력에 캐시 반영하여 0ms 무소음 렌더링 지원!
			if (window.appCalendar) {
				window.appCalendar.refetchEvents();
			}

			window.pendingSuccessMessage = datesToSave.length > 1 
				? `${datesToSave.length}개의 참석 체크가 완료되었습니다!` 
				: "참석 체크가 완료되었습니다!";
			showLoadingToast("참석 정보를 저장 중입니다...");

			// Promise.all을 활용해 모든 날짜에 대해 fetch 실행
			const savePromises = datesToSave.map(dateStr => {
				const payload = {
					action: "save",
					date: dateStr,
					name: savedNickname || userInfo.name,
					originalName: userInfo.name,
					nickname: savedNickname || "",
					profileImage: savedProfileImage || userInfo.picture,
					reason: reason
				};

				return fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
					method: "POST",
					headers: { "Content-Type": "text/plain;charset=utf-8" },
					body: JSON.stringify(payload)
				}).then(res => res.json());
			});

			Promise.all(savePromises)
				.then(results => {
					// 활성 변경 작업 개수 감소
					window.activeMutationsCount = Math.max(0, (window.activeMutationsCount || 1) - 1);
					const allSuccess = results.every(res => res.success);

					// 모든 연속적 변경이 완벽히 완료된 최후에만 단 한 번 최종 동기화 리로드 진행!
					if (window.activeMutationsCount === 0) {
						if (allSuccess) {
							document.getElementById("reasonInput").value = "";
							const successMsg = window.pendingSuccessMessage || "참석 체크가 완료되었습니다!";
							window.pendingSuccessMessage = null;
							hideLoadingToast(successMsg);
							if (window.appCalendar) {
								setTimeout(() => {
									if (window.activeMutationsCount === 0) {
										window.needsServerSync = true;
										window.appCalendar.refetchEvents();
									}
								}, 500); // 500ms의 안정적인 플러시 마진 추가
							}
						} else {
							window.pendingSuccessMessage = null;
							hideLoadingToast();
							const errMessage = results.map(r => r.error).filter(Boolean).join(", ");
							showToast("일부 저장 실패: " + errMessage, "danger");
							window.needsServerSync = true;
							if (window.appCalendar) {
								window.appCalendar.refetchEvents();
							}
						}
					}
				})
				.catch(err => {
					console.error(err);
					window.activeMutationsCount = Math.max(0, (window.activeMutationsCount || 1) - 1);
					
					if (window.activeMutationsCount === 0) {
						window.pendingSuccessMessage = null;
						hideLoadingToast();
						showToast("저장 중 오류가 발생했습니다.", "danger");
						window.needsServerSync = true;
						if (window.appCalendar) {
							window.appCalendar.refetchEvents();
						}
					}
				});
		});
	}

	const deleteBtn = document.getElementById("deleteEventBtn");
	if (deleteBtn) {
		deleteBtn.addEventListener("click", function () {
			const dateStr = document.getElementById("deleteEventDate").value;
			const savedUserStr = localStorage.getItem("dinerUserInfo");
			if (!savedUserStr) {
				showToast("로그인이 필요합니다.", "danger");
				return;
			}

			// 동작 피드백을 위해 모달을 즉시 닫습니다.
			const modalEl = document.getElementById("deleteEventModal");
			const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
			if (modal) modal.hide();

			const userInfo = JSON.parse(savedUserStr);

			// 서버 갱신 중 카운터 증가 (캘린더 백그라운드 패치를 일시 차단)
			window.activeMutationsCount = (window.activeMutationsCount || 0) + 1;

			// Optimistic Update: 로컬 캐시에서 즉각 제거
			const cachedDataStr = localStorage.getItem("dinerEventsCache");
			if (cachedDataStr) {
				try {
					let cachedEvents = JSON.parse(cachedDataStr);
					cachedEvents = cachedEvents.filter(ev => {
						const evDateStr = ev.start.split('T')[0];
						return !(evDateStr === dateStr && (ev.originalName === userInfo.name || ev.title === userInfo.name));
					});
					localStorage.setItem("dinerEventsCache", JSON.stringify(cachedEvents));
				} catch (e) {
					console.error(e);
				}
			}

			// 즉각 달력에 반영하여 0ms 무소음 렌더링 지원!
			if (window.appCalendar) {
				window.appCalendar.refetchEvents();
			}

			const payload = {
				action: "delete",
				date: dateStr,
				originalName: userInfo.name
			};

			window.pendingSuccessMessage = "참석 체크가 해제되었습니다.";
			showLoadingToast("참석 체크를 해제하는 중입니다...");

			fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify(payload)
			})
				.then(res => res.json())
				.then(data => {
					// 활성 변경 작업 개수 감소
					window.activeMutationsCount = Math.max(0, (window.activeMutationsCount || 1) - 1);
					
					// 모든 연속적 변경이 완벽히 완료된 최후에만 단 한 번 최종 동기화 리로드 진행!
					if (window.activeMutationsCount === 0) {
						if (data.success) {
							const successMsg = window.pendingSuccessMessage || "참석 체크가 해제되었습니다.";
							window.pendingSuccessMessage = null;
							hideLoadingToast(successMsg);
							if (window.appCalendar) {
								setTimeout(() => {
									if (window.activeMutationsCount === 0) {
										window.needsServerSync = true;
										window.appCalendar.refetchEvents();
									}
								}, 500); // 500ms의 안정적인 플러시 마진 추가
							}
						} else {
							window.pendingSuccessMessage = null;
							hideLoadingToast();
							showToast("삭제 실패: " + data.error, "danger");
							window.needsServerSync = true;
							if (window.appCalendar) {
								window.appCalendar.refetchEvents();
							}
						}
					}
				})
				.catch(err => {
					console.error(err);
					window.activeMutationsCount = Math.max(0, (window.activeMutationsCount || 1) - 1);
					
					if (window.activeMutationsCount === 0) {
						window.pendingSuccessMessage = null;
						hideLoadingToast();
						showToast("삭제 중 오류가 발생했습니다.", "danger");
						window.needsServerSync = true;
						if (window.appCalendar) {
							window.appCalendar.refetchEvents();
						}
					}
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
		const savedNickname = localStorage.getItem("dinerUserNickname");
		const savedProfileImage = localStorage.getItem("dinerUserProfileImage");

		document.getElementById("profile-img").src = savedProfileImage || userInfo.picture;
		document.getElementById("user-name").textContent = savedNickname || userInfo.name;
		if (savedNickname) {
			document.getElementById("user-nickname").innerHTML = savedNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
		}
		document.getElementById("login-btn-area").classList.add("hidden");
		document.getElementById("user-info").classList.remove("hidden");
	}

	// 이미지 미리보기 변수
	let tempBase64Image = null;

	// 파일 선택 시 캔버스를 이용해 압축 후 미리보기 적용
	const profileImageInput = document.getElementById('profileImageInput');
	if (profileImageInput) {
		profileImageInput.addEventListener('change', function (e) {
			const file = e.target.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = function (event) {
					const img = new Image();
					img.onload = function () {
						const canvas = document.createElement("canvas");
						const MAX_SIZE = 120; // 120px로 리사이징하여 용량 최적화
						let width = img.width;
						let height = img.height;
						if (width > height) {
							if (width > MAX_SIZE) {
								height *= MAX_SIZE / width;
								width = MAX_SIZE;
							}
						} else {
							if (height > MAX_SIZE) {
								width *= MAX_SIZE / height;
								height = MAX_SIZE;
							}
						}
						canvas.width = width;
						canvas.height = height;
						const ctx = canvas.getContext("2d");
						ctx.drawImage(img, 0, 0, width, height);
						// Base64 압축 (jpeg 포맷, 0.7 퀄리티)
						tempBase64Image = canvas.toDataURL("image/jpeg", 0.7);
						document.getElementById('profilePreview').src = tempBase64Image;
					};
					img.src = event.target.result;
				};
				reader.readAsDataURL(file);
			}
		});
	}

	// 닉네임 모달 이벤트
	const nicknameModalEl = document.getElementById('nicknameModal');
	if (nicknameModalEl) {
		nicknameModalEl.addEventListener('show.bs.modal', function () {
			// 모달창이 뜰 때 사이드바 자동으로 닫기
			const sidebar = document.getElementById("sidebar");
			const sidebarOverlay = document.getElementById("sidebar-overlay");
			if (sidebar && sidebarOverlay) {
				sidebar.classList.remove("active");
				sidebarOverlay.classList.remove("active");
			}

			const currentNickname = localStorage.getItem("dinerUserNickname");
			const currentProfileImage = localStorage.getItem("dinerUserProfileImage");

			if (currentNickname) {
				document.getElementById('nicknameInput').value = currentNickname;
			} else {
				document.getElementById('nicknameInput').value = '';
			}

			const defaultImage = document.getElementById('profile-img').src;
			document.getElementById('profilePreview').src = currentProfileImage || defaultImage;
			tempBase64Image = currentProfileImage || null;
			if (profileImageInput) profileImageInput.value = ""; // 파일 인풋 초기화
		});
	}

	const saveNicknameBtn = document.getElementById("saveNicknameBtn");
	if (saveNicknameBtn) {
		saveNicknameBtn.addEventListener("click", function () {
			const newNickname = document.getElementById("nicknameInput").value.trim();

			if (newNickname) {
				localStorage.setItem("dinerUserNickname", newNickname);
				document.getElementById("user-nickname").innerHTML = newNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
				document.getElementById("user-name").textContent = newNickname;
			} else {
				localStorage.removeItem("dinerUserNickname");
				document.getElementById("user-nickname").innerHTML = '프로필 설정 <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
				const savedUserStr = localStorage.getItem("dinerUserInfo");
				if (savedUserStr) {
					document.getElementById("user-name").textContent = JSON.parse(savedUserStr).name;
				}
			}

			if (tempBase64Image) {
				localStorage.setItem("dinerUserProfileImage", tempBase64Image);
				document.getElementById("profile-img").src = tempBase64Image;
			}

			const modal = bootstrap.Modal.getInstance(nicknameModalEl) || bootstrap.Modal.getOrCreateInstance(nicknameModalEl);
			if (modal) modal.hide();
		});
	}

	google.accounts.id.initialize({
		client_id: "143675790537-5f95f3pftgbtk5c72higjtq4bsimukfc.apps.googleusercontent.com", // 하드코딩된 client_id
		callback: handleCredentialResponse
	});

	// 커스텀 버튼 클릭 시 구글 One Tap 팝업 호출
	document.getElementById("login-btn").addEventListener("click", function () {
		// 모바일 환경에서 바닥에서 올라오는 구글 로그인 창이 사이드바에 가려지는 것을 방지하기 위해 사이드바를 먼저 닫아줍니다.
		const sidebar = document.getElementById("sidebar");
		const sidebarOverlay = document.getElementById("sidebar-overlay");
		if (sidebar && sidebarOverlay) {
			sidebar.classList.remove("active");
			sidebarOverlay.classList.remove("active");
		}
		google.accounts.id.prompt();
	});

	const logoutBtn = document.getElementById("logout-btn");
	if (logoutBtn) {
		logoutBtn.addEventListener("click", function () {
			localStorage.removeItem("dinerUserInfo");
			location.reload();
		});
	}
};

function handleCredentialResponse(response) {
	const idToken = response.credential;

	// GAS 응답과 무관하게 먼저 UI 업데이트 및 로컬 스토리지 저장을 진행합니다.
	updateUserProfile(idToken);

	fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
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

			const savedProfileImage = localStorage.getItem("dinerUserProfileImage");
			document.getElementById("profile-img").src = savedProfileImage || userInfo.picture;

			const savedNickname = localStorage.getItem("dinerUserNickname");
			document.getElementById("user-name").textContent = savedNickname || userInfo.name;
			if (savedNickname) {
				document.getElementById("user-nickname").innerHTML = savedNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
			} else {
				document.getElementById("user-nickname").innerHTML = '프로필 설정 <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
			}

			document.getElementById("login-btn-area").classList.add("hidden");
			document.getElementById("user-info").classList.remove("hidden");
		})
		.catch(error => console.error("Failed to fetch user info:", error));
}

// Bootstrap Toast helper functions
let loadingToastInstance = null;

function handleDateRangeSelect(startStr, endStr) {
	let dates = [];
	let currentDate = new Date(startStr);
	let endDate = new Date(endStr);

	while (currentDate < endDate) {
		const yyyy = currentDate.getFullYear();
		const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
		const dd = String(currentDate.getDate()).padStart(2, '0');
		dates.push(`${yyyy}-${mm}-${dd}`);
		currentDate.setDate(currentDate.getDate() + 1);
	}

	if (dates.length === 0) return;

	const savedUserStr = localStorage.getItem("dinerUserInfo");
	if (!savedUserStr) {
		showToast("로그인이 필요합니다. 먼저 로그인을 진행해주세요.", "danger");
		window.appCalendar.unselect();
		return;
	}

	const userInfo = JSON.parse(savedUserStr);
	const currentName = userInfo.name;
	const currentNickname = localStorage.getItem("dinerUserNickname");

	const allEvents = window.appCalendar.getEvents();

	if (dates.length === 1) {
		const clickedDateStr = dates[0];
		const myEventOnThisDate = allEvents.find(event => {
			const eventDateStr = event.startStr.split('T')[0];
			if (eventDateStr !== clickedDateStr) return false;
			const eventOwner = event.extendedProps.originalName || event.extendedProps.name || event.title;
			return (eventOwner === currentName || eventOwner === currentNickname);
		});

		if (myEventOnThisDate) {
			$("#deleteEventDate").val(clickedDateStr);
			$("#deleteEventModal").modal("show");
		} else {
			$("#selectedDate").val(clickedDateStr);
			$("#eventModal").modal("show");
		}
	} else {
		const datesToSave = dates.filter(dateStr => {
			const alreadyChecked = allEvents.some(event => {
				const eventDateStr = event.startStr.split('T')[0];
				if (eventDateStr !== dateStr) return false;
				const eventOwner = event.extendedProps.originalName || event.extendedProps.name || event.title;
				return (eventOwner === currentName || eventOwner === currentNickname);
			});
			return !alreadyChecked;
		});

		if (datesToSave.length === 0) {
			showToast("선택한 날짜들이 이미 모두 체크되어 있습니다.", "info");
			window.appCalendar.unselect();
			return;
		}

		window.dragSelectedDates = datesToSave;

		$("#selectedDate").val(datesToSave.join(", "));
		$("#eventModal").modal("show");
	}

	window.appCalendar.unselect();
}

function handleDateOrEventClick(clickedDateStr) {
	if (window.isLongPressActive) {
		return;
	}
	const savedUserStr = localStorage.getItem("dinerUserInfo");
	if (!savedUserStr) {
		showToast("로그인이 필요합니다. 먼저 로그인을 진행해주세요.", "danger");
		return;
	}
	const userInfo = JSON.parse(savedUserStr);
	const currentName = userInfo.name;
	const currentNickname = localStorage.getItem("dinerUserNickname");

	// 현재 캘린더의 모든 이벤트 가져오기
	const allEvents = window.appCalendar.getEvents();

	// 해당 날짜의 내 이벤트가 있는지 확인
	const myEventOnThisDate = allEvents.find(event => {
		const eventDateStr = event.startStr.split('T')[0];
		if (eventDateStr !== clickedDateStr) return false;

		const eventOwner = event.extendedProps.originalName || event.extendedProps.name || event.title;
		return (eventOwner === currentName || eventOwner === currentNickname);
	});

	if (myEventOnThisDate) {
		// 내가 이미 체크한 경우 -> 해제 모달 띄우기 (본인만 해제 가능)
		$("#deleteEventDate").val(clickedDateStr);
		$("#deleteEventModal").modal("show");
	} else {
		// 체크하지 않은 경우 -> 등록 모달 띄우기
		$("#selectedDate").val(clickedDateStr);
		$("#eventModal").modal("show");
	}
}

function showToast(message, type = 'dark', delay = 3000) {
	const toastEl = document.getElementById('appToast');
	if (!toastEl) return;

	const toastBody = document.getElementById('toastBody');
	toastBody.textContent = message;

	// Reset alert classes
	toastEl.className = `toast align-items-center text-white border-0 rounded-3 shadow`;
	if (type === 'danger') {
		toastEl.classList.add('bg-danger');
	} else if (type === 'success') {
		toastEl.classList.add('bg-success');
	} else if (type === 'info') {
		toastEl.classList.add('bg-info');
	} else {
		toastEl.classList.add('bg-dark');
	}

	const toast = new bootstrap.Toast(toastEl, { delay: delay });
	toast.show();
}

function showLoadingToast(message) {
	const toastEl = document.getElementById('loadingToast');
	if (!toastEl) return;

	const toastBody = document.getElementById('loadingToastBody');
	toastBody.textContent = message;

	loadingToastInstance = new bootstrap.Toast(toastEl, { autohide: false });
	loadingToastInstance.show();
}

function hideLoadingToast(successMessage) {
	if (loadingToastInstance) {
		loadingToastInstance.hide();
	}
	if (successMessage) {
		setTimeout(() => {
			showToast(successMessage, "success", 2000);
		}, 300);
	}
}

// 5인 이상 참석 확정 배지(훈장) 렌더링
function renderConfirmedDateBadges(events) {
	// 먼저 모든 기존 배지 엘리먼트 제거
	document.querySelectorAll('.confirmed-badge').forEach(el => el.remove());

	const counts = {};
	events.forEach(ev => {
		const dateStr = ev.start.split('T')[0];
		counts[dateStr] = (counts[dateStr] || 0) + 1;
	});

	for (const dateStr in counts) {
		if (counts[dateStr] >= 5) {
			const cellTop = document.querySelector(`.fc-daygrid-day[data-date="${dateStr}"] .fc-daygrid-day-top`);
			if (cellTop) {
				if (!cellTop.querySelector('.confirmed-badge')) {
					const badge = document.createElement('span');
					badge.className = 'material-symbols-outlined text-warning confirmed-badge ms-1 align-middle';
					badge.style.fontSize = '15px';
					badge.style.cursor = 'pointer';
					badge.title = '5인 이상 참석 확정!';
					badge.textContent = 'workspace_premium'; // 상장/훈장 느낌의 아이콘!

					cellTop.appendChild(badge);
				}
			}
		}
	}
}

// 이번주 목요일 ~ 다음주 수요일 계산 헬퍼
function getCurrentCycleRange(refDate = new Date()) {
	const day = refDate.getDay();
	let start = new Date(refDate);

	if (day >= 4) { // 목, 금, 토
		start.setDate(refDate.getDate() - (day - 4));
	} else { // 일, 월, 화, 수
		start.setDate(refDate.getDate() - (day + 3));
	}

	start.setHours(0, 0, 0, 0);

	let end = new Date(start);
	end.setDate(start.getDate() + 6);
	end.setHours(23, 59, 59, 999);

	return { start, end };
}

// 일정 관리 페이지(Schedule) 제어 로직
function initSchedulePage() {
	console.log("📅 Initializing Schedule Page...");

	const range = getCurrentCycleRange();
	const formatDateString = (d) => {
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		const week = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
		return `${yyyy}-${mm}-${dd} (${week})`;
	};

	const rangeText = `${formatDateString(range.start)} ~ ${formatDateString(range.end)}`;
	const cycleTextEl = document.getElementById("cycle-range-text");
	if (cycleTextEl) cycleTextEl.textContent = `${formatDateString(range.start)} ~ ${formatDateString(range.end)}`;

	const cycleBadgeEl = document.getElementById("cycle-badge");
	if (cycleBadgeEl) cycleBadgeEl.textContent = `${range.start.getMonth() + 1}월 ${range.start.getDate()}일 주간`;

	const dateInput = document.getElementById("sched-date");
	if (dateInput) {
		const todayStr = new Date().toISOString().split('T')[0];
		dateInput.value = todayStr;
	}

	// 1. 로컬 캐시를 읽어와 즉시 일정과 참석자 선택기 렌더링
	const cachedEventsStr = localStorage.getItem("dinerEventsCache");
	if (cachedEventsStr) {
		try {
			populateAttendeesSelector(JSON.parse(cachedEventsStr));
		} catch (e) {
			console.error(e);
		}
	}

	const cachedScheds = localStorage.getItem("dinerSchedulesCache");
	if (cachedScheds) {
		try {
			renderSchedulesList(JSON.parse(cachedScheds), range.start, range.end);
		} catch (e) {
			console.error(e);
		}
	}

	// 2. 서버 통신 동기화 실행
	fetchSchedulesAndEventsFromServer(range.start, range.end);

	// 3. 새 일정 수동 추가 리스너
	const form = document.getElementById("new-schedule-form");
	if (form) {
		form.onsubmit = function (e) {
			e.preventDefault();
			const dateVal = document.getElementById("sched-date").value;
			const titleVal = document.getElementById("sched-title").value;
			
			// 체크된 체크박스로부터 참석자 명단 생성
			const checkedCheckboxes = document.querySelectorAll('.sched-user-checkbox:checked');
			const attendeesVal = Array.from(checkedCheckboxes).map(cb => cb.value).join(", ");

			const savedUserStr = localStorage.getItem("dinerUserInfo");
			if (!savedUserStr) {
				showToast("로그인이 필요합니다. 먼저 로그인을 진행해주세요.", "danger");
				return;
			}

			showLoadingToast("새 수동 일정을 등록하는 중입니다...");

			const payload = {
				action: "saveSchedule",
				date: dateVal,
				title: titleVal,
				attendees: attendeesVal
			};

			fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify(payload)
			})
				.then(res => res.json())
				.then(data => {
					if (data.success) {
						document.getElementById("sched-title").value = "";
						document.querySelectorAll('.sched-user-checkbox').forEach(cb => cb.checked = false);
						showToast("수동 일정이 등록되었습니다!", "success");

						// 동기화 재수행
						fetchSchedulesAndEventsFromServer(range.start, range.end);
					} else {
						hideLoadingToast();
						showToast("일정 추가 실패: " + data.error, "danger");
					}
				})
				.catch(err => {
					console.error(err);
					hideLoadingToast();
					showToast("일정 추가 중 오류가 발생했습니다.", "danger");
				});
		};
	}

	// 4. 모달 내 일정 이름 변경 완료 리스너
	const saveEditBtn = document.getElementById("saveEditScheduleBtn");
	if (saveEditBtn) {
		saveEditBtn.onclick = function () {
			const idVal = document.getElementById("edit-sched-id").value;
			const titleVal = document.getElementById("edit-sched-title").value;

			if (!titleVal.trim()) {
				showToast("일정 이름을 입력해 주세요.", "danger");
				return;
			}

			const modalEl = document.getElementById("editScheduleModal");
			const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
			if (modal) modal.hide();

			showLoadingToast("일정 이름을 변경하는 중입니다...");

			const payload = {
				action: "updateSchedule",
				id: idVal,
				title: titleVal
			};

			fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify(payload)
			})
				.then(res => res.json())
				.then(data => {
					if (data.success) {
						showToast("일정 이름이 변경되었습니다!", "success");
						fetchSchedulesAndEventsFromServer(range.start, range.end);
					} else {
						hideLoadingToast();
						showToast("이름 수정 실패: " + data.error, "danger");
					}
				})
				.catch(err => {
					console.error(err);
					hideLoadingToast();
					showToast("일정 수정 중 오류가 발생했습니다.", "danger");
				});
		};
	}
}

function fetchSchedulesAndEventsFromServer(start, end) {
	fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec")
		.then(res => res.json())
		.then(data => {
			hideLoadingToast();
			let eventsArray = [];
			let schedulesArray = [];
			if (data && data.events) {
				eventsArray = data.events;
				schedulesArray = data.schedules;

				// 로컬 캐시 실시간 갱신
				localStorage.setItem("dinerEventsCache", JSON.stringify(eventsArray));
				localStorage.setItem("dinerSchedulesCache", JSON.stringify(schedulesArray));

				// 참석자 체크박스 선택기 갱신
				populateAttendeesSelector(eventsArray);
				
				renderSchedulesList(schedulesArray, start, end);
			}
		})
		.catch(err => {
			console.error(err);
			hideLoadingToast();
			showToast("서버 일정 동기화에 실패했습니다.", "danger");
		});
}

function renderSchedulesList(schedules, cycleStart, cycleEnd) {
	const listEl = document.getElementById("schedule-list");
	if (!listEl) return;

	const filtered = schedules.filter(s => {
		const d = new Date(s.date);
		return d >= cycleStart && d <= cycleEnd;
	});

	filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

	if (filtered.length === 0) {
		listEl.innerHTML = `
			<div class="text-center py-5 text-secondary border rounded-4 bg-light">
				<span class="material-symbols-outlined text-muted" style="font-size: 48px;">event_busy</span>
				<div class="mt-2 fw-semibold">이번 주간에 등록된 일정이 없습니다.</div>
				<div class="small text-muted mt-1">캘린더에서 5명 이상 참석 체크 시 자동으로 일정이 생성됩니다.</div>
				<div class="small text-muted mt-1">또는 폼을 통해 수동으로 등록할 수도 있습니다.</div>
			</div>
		`;
		return;
	}

	let html = '';
	filtered.forEach(s => {
		const sDateObj = new Date(s.date);
		const mm = String(sDateObj.getMonth() + 1).padStart(2, '0');
		const dd = String(sDateObj.getDate()).padStart(2, '0');
		const week = ["일", "월", "화", "수", "목", "금", "토"][sDateObj.getDay()];

		const badgeHtml = s.isAuto
			? `<span class="badge bg-warning text-dark d-flex align-items-center gap-1 px-3 py-2 rounded-pill"><span class="material-symbols-outlined" style="font-size: 14px;">workspace_premium</span>5인 이상 확정</span>`
			: `<span class="badge bg-success text-white d-flex align-items-center gap-1 px-3 py-2 rounded-pill"><span class="material-symbols-outlined" style="font-size: 14px;">stylus</span>수동 일정</span>`;

		html += `
			<div class="card border rounded-3 p-3 shadow-sm hover-shadow transition mb-2" style="background-color: #fcfcfc;">
				<div class="d-flex justify-content-between align-items-start gap-2">
					<div class="d-flex align-items-start gap-3">
						<div class="text-center bg-dark text-white rounded-3 px-3 py-2 fw-bold" style="min-width: 75px;">
							<div class="small" style="font-size: 11px;">${week}요일</div>
							<div class="fs-4 lh-1 mt-1">${mm}/${dd}</div>
						</div>
						<div>
							<div class="d-flex align-items-center gap-2">
								<h5 class="fw-bold mb-0 text-dark" id="sched-title-${s.id}">${s.title}</h5>
								<button class="btn btn-sm btn-link p-0 text-secondary d-flex align-items-center" onclick="openEditScheduleModal('${s.id}', '${s.title}')" title="일정 이름 수정">
									<span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
								</button>
							</div>
							<div class="text-secondary small mt-2 d-flex align-items-center gap-1">
								<span class="material-symbols-outlined text-muted" style="font-size: 16px;">group</span>
								<span class="fw-semibold text-dark">참석자:</span> ${s.attendees || '없음'}
							</div>
						</div>
					</div>
					<div>
						${badgeHtml}
					</div>
				</div>
			</div>
		`;
	});

	listEl.innerHTML = html;
}

// 캘린더 참석 데이터를 기반으로 고유한 실사용자 목록 추출 후 체크박스 선택기 동적 빌드
function populateAttendeesSelector(events) {
	const listEl = document.getElementById("sched-attendees-list");
	if (!listEl) return;

	const users = {};
	events.forEach(ev => {
		const displayName = ev.nickname || ev.title;
		if (displayName && displayName.trim()) {
			users[displayName.trim()] = true;
		}
	});

	const uniqueUsers = Object.keys(users).sort();

	if (uniqueUsers.length === 0) {
		listEl.innerHTML = `<span class="text-muted small">동기화된 사용자가 없습니다.</span>`;
		return;
	}

	let html = '';
	uniqueUsers.forEach((user, index) => {
		html += `
			<div class="form-check mb-1">
				<input class="form-check-input sched-user-checkbox" type="checkbox" value="${user}" id="userCheck-${index}">
				<label class="form-check-label small text-dark fw-medium" for="userCheck-${index}" style="cursor: pointer;">
					${user}
				</label>
			</div>
		`;
	});
	listEl.innerHTML = html;
}

window.openEditScheduleModal = function (id, title) {
	document.getElementById("edit-sched-id").value = id;
	document.getElementById("edit-sched-title").value = title;

	const modalEl = document.getElementById("editScheduleModal");
	const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
	if (modal) modal.show();
};