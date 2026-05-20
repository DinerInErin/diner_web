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
			calendarEl.dataset.initialized = "true";
			console.log("✅ Calendar detected, initializing...");

			let touchStartX = 0;
			let touchStartY = 0;
			let touchStartTime = 0;

			calendarEl.addEventListener("touchstart", function(e) {
				const dayCell = e.target.closest(".fc-daygrid-day");
				if (!dayCell) return;
				if (e.target.closest(".fc-event")) return;
				
				const touch = e.touches[0];
				touchStartX = touch.clientX;
				touchStartY = touch.clientY;
				touchStartTime = Date.now();
			}, { passive: true });

			calendarEl.addEventListener("touchend", function(e) {
				const dayCell = e.target.closest(".fc-daygrid-day");
				if (!dayCell) return;
				if (e.target.closest(".fc-event")) return;
				
				const touch = e.changedTouches[0];
				const diffX = Math.abs(touch.clientX - touchStartX);
				const diffY = Math.abs(touch.clientY - touchStartY);
				const diffTime = Date.now() - touchStartTime;
				
				if (diffX < 10 && diffY < 10 && diffTime < 250) {
					const dateStr = dayCell.getAttribute("data-date");
					if (dateStr) {
						e.preventDefault();
						if (typeof handleDateRangeSelect === "function") {
							handleDateRangeSelect(dateStr, dateStr);
						}
					}
				}
			}, { passive: false });

			window.appCalendar = new FullCalendar.Calendar(calendarEl, {
				initialView: "dayGridMonth",
				locale: "ko",
				selectable: true,
				selectMirror: true,
				unselectAuto: true,
				selectLongPressDelay: 350,
				fixedWeekCount: false,
				headerToolbar: false,
				height: "auto",
				dayMaxEvents: 5,
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
							if (typeof pregenerateAllUserAvatars === "function") {
								pregenerateAllUserAvatars(function() {
									successCallback(cachedEvents);
									setTimeout(() => { renderConfirmedDateBadges(cachedEvents); }, 50);
									if (window.selectedActiveDate && typeof updateDailyEventsList === "function") {
										setTimeout(() => { updateDailyEventsList(window.selectedActiveDate); }, 60);
									}
								});
							} else {
								successCallback(cachedEvents);
								setTimeout(() => { renderConfirmedDateBadges(cachedEvents); }, 50);
								if (window.selectedActiveDate && typeof updateDailyEventsList === "function") {
									setTimeout(() => { updateDailyEventsList(window.selectedActiveDate); }, 60);
								}
							}
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
								localStorage.setItem("dinerSchedulesCache", JSON.stringify(schedulesArray));
								if (data.users) {
									localStorage.setItem("dinerUsersCache", JSON.stringify(data.users));
								}
							} else if (Array.isArray(data)) {
								eventsArray = data;
							}

							localStorage.setItem("dinerEventsCache", JSON.stringify(eventsArray));

							if (typeof pregenerateAllUserAvatars === "function") {
								pregenerateAllUserAvatars(function() {
									if (window.isFirstLoad) {
										window.isFirstLoad = false;
										hideLoadingToast("캘린더 데이터 동기화 완료!");
									} else if (!hasCache) {
										hideLoadingToast("캘린더 데이터 로딩 완료!");
									}
									if (window.appCalendar) {
										window.appCalendar.refetchEvents();
									}
								});
							} else {
								if (window.isFirstLoad) {
									window.isFirstLoad = false;
									hideLoadingToast("캘린더 데이터 동기화 완료!");
								} else if (!hasCache) {
									hideLoadingToast("캘린더 데이터 로딩 완료!");
								}
								if (window.appCalendar) {
									window.appCalendar.refetchEvents();
								}
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
					const start = new Date(selectionInfo.startStr);
					const end = new Date(selectionInfo.endStr);
					const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
					if (diffDays > 1) {
						handleDateRangeSelect(selectionInfo.startStr, selectionInfo.endStr);
					}
				},
				dateClick: function (info) {
					handleDateRangeSelect(info.dateStr, info.dateStr);
				},
				eventClick: function (info) {
					const dateStr = info.event.startStr.split('T')[0];
					handleDateOrEventClick(dateStr);
				},
				eventContent: function (arg) {
					const eventTitle = arg.event.title || arg.event.extendedProps.name;
					const eventOrigName = arg.event.extendedProps.originalName;
					let usersCache = [];
					try {
						usersCache = JSON.parse(localStorage.getItem("dinerUsersCache") || "[]");
					} catch(e) {}

					const user = usersCache.find(u => 
						(eventTitle && u.Nickname === eventTitle) || 
						(eventOrigName && u.Nickname === eventOrigName) || 
						(eventOrigName && u.Email === eventOrigName)
					);
					let bodyColor = "#A3D9C9";
					let bgColor = "#FAF8F5";
					let isWhiteLine = "black";

					if (user) {
						bodyColor = user.DinoBodyColor;
						bgColor = user.DinoBgColor;
						isWhiteLine = user.DinoLineColor || "black";
					} else {
						const savedUserStr = localStorage.getItem("dinerUserInfo");
						if (savedUserStr) {
							const userInfo = JSON.parse(savedUserStr);
							const myNickname = localStorage.getItem("dinerUserNickname");
							if (eventTitle === userInfo.name || eventTitle === myNickname || eventOrigName === userInfo.name || eventOrigName === userInfo.email) {
								bodyColor = localStorage.getItem("dinoBodyColor") || "#A3D9C9";
								bgColor = localStorage.getItem("dinoBgColor") || "#FAF8F5";
								isWhiteLine = localStorage.getItem("dinoLineColor") || "black";
							}
						}
					}

					const cacheKey = `${bodyColor}_${bgColor}_${isWhiteLine}`;
					let profileImage = window.dinoAvatarCache[cacheKey] || "resource/image/default-profile.png";
					const memo = arg.event.extendedProps.reason || "";
					const displayName = user ? user.Nickname : eventTitle;
					let imgHtml = `<div class="d-flex align-items-center fc-event-wrapper"><img src="${profileImage}" class="shadow-sm fc-event-avatar" data-bs-toggle="tooltip" data-bs-placement="top" title="${memo || displayName}"><span class="fc-event-title-text" style="display: none;">${displayName}</span></div>`;

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
		const bodyColor = localStorage.getItem("dinoBodyColor") || "#A3D9C9";
		const bgColor = localStorage.getItem("dinoBgColor") || "#FAF8F5";

		document.getElementById("user-name").textContent = savedNickname || userInfo.name;
		if (savedNickname) {
			document.getElementById("user-nickname").innerHTML = savedNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
		}
		
		if (typeof generateDinoAvatar === "function") {
			generateDinoAvatar(bodyColor, bgColor, function(avatarUrl) {
				localStorage.setItem("dinerUserProfileImage", avatarUrl);
				document.getElementById("profile-img").src = avatarUrl;
			});
		}

		document.getElementById("login-btn-area").classList.add("hidden");
		document.getElementById("user-info").classList.remove("hidden");
	}

	// 닉네임 모달 이벤트
	const nicknameModalEl = document.getElementById('nicknameModal');
	if (nicknameModalEl) {
		nicknameModalEl.addEventListener('show.bs.modal', function () {
			const sidebar = document.getElementById("sidebar");
			const sidebarOverlay = document.getElementById("sidebar-overlay");
			if (sidebar && sidebarOverlay) {
				sidebar.classList.remove("active");
				sidebarOverlay.classList.remove("active");
			}

			const currentNickname = localStorage.getItem("dinerUserNickname");
			const bodyColor = localStorage.getItem("dinoBodyColor") || "#A3D9C9";
			const bgColor = localStorage.getItem("dinoBgColor") || "#FAF8F5";
			const lineColor = localStorage.getItem("dinoLineColor") || "black";

			document.getElementById('nicknameInput').value = currentNickname || "";
			document.getElementById('dinoBodyColor').value = bodyColor;
			document.getElementById('dinoBgColor').value = bgColor;
			document.getElementById('dinoLineColorToggle').checked = (lineColor === "white");

			setTimeout(() => {
				if (typeof drawDinoPreview === "function") {
					drawDinoPreview(bodyColor, bgColor, lineColor);
				}
			}, 100);
		});
	}

	const dinoBodyColorInput = document.getElementById("dinoBodyColor");
	const dinoBgColorInput = document.getElementById("dinoBgColor");
	const dinoLineColorToggle = document.getElementById("dinoLineColorToggle");
	if (dinoBodyColorInput && dinoBgColorInput && dinoLineColorToggle) {
		const updatePreview = () => {
			if (typeof drawDinoPreview === "function") {
				const isWhite = dinoLineColorToggle.checked;
				drawDinoPreview(dinoBodyColorInput.value, dinoBgColorInput.value, isWhite ? "white" : "black");
			}
		};
		dinoBodyColorInput.addEventListener("input", updatePreview);
		dinoBgColorInput.addEventListener("input", updatePreview);
		dinoLineColorToggle.addEventListener("change", updatePreview);
	}

	const saveNicknameBtn = document.getElementById("saveNicknameBtn");
	if (saveNicknameBtn) {
		saveNicknameBtn.addEventListener("click", function () {
			const newNickname = document.getElementById("nicknameInput").value.trim();
			if (!newNickname) {
				showToast("닉네임을 입력해주세요.", "danger");
				return;
			}

			const bodyColor = document.getElementById("dinoBodyColor").value;
			const bgColor = document.getElementById("dinoBgColor").value;
			const isWhite = document.getElementById("dinoLineColorToggle").checked;
			const lineColor = isWhite ? "white" : "black";

			localStorage.setItem("dinerUserNickname", newNickname);
			localStorage.setItem("dinoBodyColor", bodyColor);
			localStorage.setItem("dinoBgColor", bgColor);
			localStorage.setItem("dinoLineColor", lineColor);

			document.getElementById("user-nickname").innerHTML = newNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
			document.getElementById("user-name").textContent = newNickname;

			const savedUserStr = localStorage.getItem("dinerUserInfo");
			if (savedUserStr) {
				const userInfo = JSON.parse(savedUserStr);
				
				showLoadingToast("프로필을 저장하는 중입니다...");
				fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
					method: "POST",
					headers: { "Content-Type": "text/plain;charset=utf-8" },
					body: JSON.stringify({
						action: "saveUser",
						email: userInfo.email,
						nickname: newNickname,
						dinoBodyColor: bodyColor,
						dinoBgColor: bgColor,
						dinoLineColor: lineColor
					})
				})
				.then(res => res.json())
				.then(data => {
					if (data.success) {
						if (typeof generateDinoAvatar === "function") {
							generateDinoAvatar(bodyColor, bgColor, lineColor, function(avatarUrl) {
								localStorage.setItem("dinerUserProfileImage", avatarUrl);
								document.getElementById("profile-img").src = avatarUrl;
								
								let usersCache = [];
								const cached = localStorage.getItem("dinerUsersCache");
								if (cached) {
									try {
										usersCache = JSON.parse(cached);
									} catch(e) {}
								}
								const userIdx = usersCache.findIndex(u => u.Email === userInfo.email);
								if (userIdx !== -1) {
									usersCache[userIdx].Nickname = newNickname;
									usersCache[userIdx].DinoBodyColor = bodyColor;
									usersCache[userIdx].DinoBgColor = bgColor;
									usersCache[userIdx].DinoLineColor = lineColor;
								} else {
									usersCache.push({
										Email: userInfo.email,
										Nickname: newNickname,
										DinoBodyColor: bodyColor,
										DinoBgColor: bgColor,
										DinoLineColor: lineColor
									});
								}
								localStorage.setItem("dinerUsersCache", JSON.stringify(usersCache));
								
								hideLoadingToast("프로필 저장 완료!");
								window.needsServerSync = true;
								if (window.appCalendar) {
									window.appCalendar.refetchEvents();
								}
							});
						}
					} else {
						hideLoadingToast("프로필 저장 실패");
					}
				})
				.catch(err => {
					console.error(err);
					hideLoadingToast("서버 연결 실패");
				});
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

			let usersCache = [];
			const cached = localStorage.getItem("dinerUsersCache");
			if (cached) {
				try {
					usersCache = JSON.parse(cached);
				} catch (e) {}
			}

			const dbUser = usersCache.find(u => u.Email === userInfo.email);

			if (dbUser) {
				localStorage.setItem("dinerUserNickname", dbUser.Nickname);
				localStorage.setItem("dinoBodyColor", dbUser.DinoBodyColor);
				localStorage.setItem("dinoBgColor", dbUser.DinoBgColor);
				localStorage.setItem("dinoLineColor", dbUser.DinoLineColor || "black");

				document.getElementById("user-name").textContent = dbUser.Nickname;
				document.getElementById("user-nickname").innerHTML = dbUser.Nickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';

				if (typeof generateDinoAvatar === "function") {
					generateDinoAvatar(dbUser.DinoBodyColor, dbUser.DinoBgColor, dbUser.DinoLineColor || "black", function(avatarUrl) {
						localStorage.setItem("dinerUserProfileImage", avatarUrl);
						document.getElementById("profile-img").src = avatarUrl;
					});
				}
			} else {
				const newNickname = userInfo.name;
				const bodyColor = "#D0D0D0";
				const bgColor = "#EAEAEA";
				const lineColor = "black";

				localStorage.setItem("dinerUserNickname", newNickname);
				localStorage.setItem("dinoBodyColor", bodyColor);
				localStorage.setItem("dinoBgColor", bgColor);
				localStorage.setItem("dinoLineColor", lineColor);

				document.getElementById("user-name").textContent = newNickname;
				document.getElementById("user-nickname").innerHTML = newNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';

				if (typeof generateDinoAvatar === "function") {
					generateDinoAvatar(bodyColor, bgColor, lineColor, function(avatarUrl) {
						localStorage.setItem("dinerUserProfileImage", avatarUrl);
						document.getElementById("profile-img").src = avatarUrl;
					});
				}

				fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
					method: "POST",
					headers: { "Content-Type": "text/plain;charset=utf-8" },
					body: JSON.stringify({
						action: "saveUser",
						email: userInfo.email,
						nickname: newNickname,
						dinoBodyColor: bodyColor,
						dinoBgColor: bgColor,
						dinoLineColor: lineColor
					})
				})
				.then(res => res.json())
				.then(data => {
					if (data.success) {
						let usersCache = [];
						const cached = localStorage.getItem("dinerUsersCache");
						if (cached) {
							try { usersCache = JSON.parse(cached); } catch(e) {}
						}
						const userIdx = usersCache.findIndex(u => u.Email === userInfo.email);
						const newUserData = {
							Email: userInfo.email,
							Nickname: newNickname,
							DinoBodyColor: bodyColor,
							DinoBgColor: bgColor,
							DinoLineColor: lineColor
						};
						if (userIdx !== -1) {
							usersCache[userIdx] = newUserData;
						} else {
							usersCache.push(newUserData);
						}
						localStorage.setItem("dinerUsersCache", JSON.stringify(usersCache));
						if (window.appCalendar) {
							window.appCalendar.refetchEvents();
						}
					}
				})
				.catch(err => console.error("GAS auto register fail:", err));

				setTimeout(() => {
					const nicknameModalEl = document.getElementById('nicknameModal');
					if (nicknameModalEl) {
						const modal = bootstrap.Modal.getInstance(nicknameModalEl) || bootstrap.Modal.getOrCreateInstance(nicknameModalEl);
						if (modal) modal.show();
					}
				}, 500);
			}

			document.getElementById("login-btn-area").classList.add("hidden");
			document.getElementById("user-info").classList.remove("hidden");
		})
		.catch(error => console.error("Failed to fetch user info:", error));
}

// Bootstrap Toast helper functions
let loadingToastInstance = null;

function handleDateRangeSelect(startStr, endStr) {
	if (startStr === endStr) {
		const nextDate = new Date(startStr);
		nextDate.setDate(nextDate.getDate() + 1);
		const yyyy = nextDate.getFullYear();
		const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
		const dd = String(nextDate.getDate()).padStart(2, '0');
		endStr = `${yyyy}-${mm}-${dd}`;
	}
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
	window.selectedActiveDate = clickedDateStr;
	updateDailyEventsList(clickedDateStr);
}

function updateDailyEventsList(clickedDateStr) {
	const savedUserStr = localStorage.getItem("dinerUserInfo");
	if (!savedUserStr) {
		showToast("로그인이 필요합니다. 먼저 로그인을 진행해주세요.", "danger");
		return;
	}
	const userInfo = JSON.parse(savedUserStr);
	const currentName = userInfo.name;
	const currentNickname = localStorage.getItem("dinerUserNickname");

	const allEvents = window.appCalendar.getEvents();
	const dailyEvents = allEvents.filter(event => event.startStr.split('T')[0] === clickedDateStr);

	const parts = clickedDateStr.split("-");
	const formattedDate = `${parseInt(parts[1])}월 ${parseInt(parts[2])}일 참석 희망자 목록 (${dailyEvents.length}명)`;
	
	const titleEl = document.getElementById("selected-date-title");
	if (titleEl) {
		titleEl.textContent = formattedDate;
	}

	const listEl = document.getElementById("daily-events-list");
	if (listEl) {
		listEl.innerHTML = "";
		if (dailyEvents.length === 0) {
			listEl.innerHTML = `<div class="text-center text-muted py-3 fs-7">등록된 참석 희망자가 없습니다.</div>`;
		} else {
			dailyEvents.forEach(event => {
				const eventTitle = event.title || event.extendedProps.name;
				const eventOrigName = event.extendedProps.originalName;
				let usersCache = [];
				try {
					usersCache = JSON.parse(localStorage.getItem("dinerUsersCache") || "[]");
				} catch(e) {}

				const user = usersCache.find(u => 
					(eventTitle && u.Nickname === eventTitle) || 
					(eventOrigName && u.Nickname === eventOrigName) || 
					(eventOrigName && u.Email === eventOrigName)
				);
				let bodyColor = "#A3D9C9";
				let bgColor = "#FAF8F5";
				let isWhiteLine = "black";

				if (user) {
					bodyColor = user.DinoBodyColor;
					bgColor = user.DinoBgColor;
					isWhiteLine = user.DinoLineColor || "black";
				} else {
					if (eventTitle === currentName || eventTitle === currentNickname || eventOrigName === currentName) {
						bodyColor = localStorage.getItem("dinoBodyColor") || "#A3D9C9";
						bgColor = localStorage.getItem("dinoBgColor") || "#FAF8F5";
						isWhiteLine = localStorage.getItem("dinoLineColor") || "black";
					}
				}

				const cacheKey = `${bodyColor}_${bgColor}_${isWhiteLine}`;
				let profileImage = window.dinoAvatarCache[cacheKey] || "resource/image/default-profile.png";
				const memo = event.extendedProps.reason || "메모 없음";

				const itemHtml = `
					<div class="d-flex align-items-center gap-3 p-2 rounded-3 bg-light">
						<img src="${profileImage}" class="rounded-circle border border-2 border-white shadow-sm" style="width: 36px; height: 36px; object-fit: cover;">
						<div class="flex-grow-1">
							<div class="fw-bold text-dark fs-6">${eventOwner}</div>
							<div class="text-muted fs-7">${memo}</div>
						</div>
					</div>
				`;
				listEl.insertAdjacentHTML("beforeend", itemHtml);
			});
		}
	}

	const myEvent = dailyEvents.find(event => {
		const eventOwner = event.extendedProps.originalName || event.extendedProps.name || event.title;
		return (eventOwner === currentName || eventOwner === currentNickname);
	});

	const actionEl = document.getElementById("daily-events-action");
	if (actionEl) {
		actionEl.innerHTML = "";
		if (myEvent) {
			actionEl.innerHTML = `
				<button class="btn btn-danger rounded-pill px-4" onclick="triggerDeleteEvent('${clickedDateStr}')">참석 취소하기</button>
			`;
		} else {
			actionEl.innerHTML = `
				<button class="btn btn-primary rounded-pill px-4" onclick="triggerAddEvent('${clickedDateStr}')">참석 등록하기</button>
			`;
		}
	}

	const containerEl = document.getElementById("daily-events-container");
	if (containerEl) {
		containerEl.classList.remove("d-none");
		if (window.innerWidth < 768) {
			const mainContainer = document.getElementById("main-container");
			if (mainContainer) {
				setTimeout(() => {
					mainContainer.scrollTo({
						top: containerEl.offsetTop - 80,
						behavior: "smooth"
					});
				}, 100);
			}
		}
	}
}

window.triggerAddEvent = function(dateStr) {
	$("#selectedDate").val(dateStr);
	$("#eventModal").modal("show");
};

window.triggerDeleteEvent = function(dateStr) {
	$("#deleteEventDate").val(dateStr);
	$("#deleteEventModal").modal("show");
};

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
					const badge = document.createElement('img');
					badge.className = 'confirmed-badge';
					badge.src = 'resource/image/confirmed-badge.png';
					badge.title = '5인 이상 참석 확정!';
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

	// const cycleBadgeEl = document.getElementById("cycle-badge");
	// if (cycleBadgeEl) cycleBadgeEl.textContent = `${range.start.getMonth() + 1}월 ${range.start.getDate()}일 주간`;

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

window.dinoAvatarCache = {};

window.generateDinoAvatar = function(bodyColor, bgColor, isWhiteLine, callback) {
	if (typeof isWhiteLine === "function") {
		callback = isWhiteLine;
		isWhiteLine = false;
	}

	const cacheKey = `${bodyColor}_${bgColor}_${isWhiteLine}`;
	if (window.dinoAvatarCache[cacheKey]) {
		callback(window.dinoAvatarCache[cacheKey]);
		return;
	}

	const canvas = document.createElement("canvas");
	canvas.width = 120;
	canvas.height = 120;
	const ctx = canvas.getContext("2d");

	ctx.fillStyle = bgColor || "#FAF8F5";
	ctx.fillRect(0, 0, 120, 120);

	const maskImg = new Image();
	maskImg.src = "resource/image/dino_mask.png";
	maskImg.onload = function() {
		const tempCanvas = document.createElement("canvas");
		tempCanvas.width = 120;
		tempCanvas.height = 120;
		const tempCtx = tempCanvas.getContext("2d");

		// 패딩을 주어 중앙에 84x84 크기로 렌더링 (상하좌우 18px 여백)
		tempCtx.drawImage(maskImg, 18, 18, 84, 84);
		tempCtx.globalCompositeOperation = "source-in";
		tempCtx.fillStyle = bodyColor || "#A3D9C9";
		tempCtx.fillRect(18, 18, 84, 84);

		ctx.drawImage(tempCanvas, 0, 0);

		const lineImg = new Image();
		lineImg.src = "resource/image/dino_line.png";
		lineImg.onload = function() {
			const tempLineCanvas = document.createElement("canvas");
			tempLineCanvas.width = 120;
			tempLineCanvas.height = 120;
			const tempLineCtx = tempLineCanvas.getContext("2d");

			tempLineCtx.drawImage(lineImg, 18, 18, 84, 84);
			if (isWhiteLine === true || isWhiteLine === "white" || isWhiteLine === "true") {
				tempLineCtx.globalCompositeOperation = "source-in";
				tempLineCtx.fillStyle = "#FFFFFF";
				tempLineCtx.fillRect(18, 18, 84, 84);
			}

			ctx.drawImage(tempLineCanvas, 0, 0);
			const dataUrl = canvas.toDataURL("image/png");
			window.dinoAvatarCache[cacheKey] = dataUrl;
			callback(dataUrl);
		};
	};
};

window.drawDinoPreview = function(bodyColor, bgColor, isWhiteLine) {
	const canvas = document.getElementById("profilePreviewCanvas");
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	ctx.clearRect(0, 0, 80, 80);
	
	ctx.fillStyle = bgColor || "#FAF8F5";
	ctx.fillRect(0, 0, 80, 80);

	const maskImg = new Image();
	maskImg.src = "resource/image/dino_mask.png";
	maskImg.onload = function() {
		const tempCanvas = document.createElement("canvas");
		tempCanvas.width = 80;
		tempCanvas.height = 80;
		const tempCtx = tempCanvas.getContext("2d");

		// 패딩을 주어 중앙에 56x56 크기로 렌더링 (상하좌우 12px 여백)
		tempCtx.drawImage(maskImg, 12, 12, 56, 56);
		tempCtx.globalCompositeOperation = "source-in";
		tempCtx.fillStyle = bodyColor || "#A3D9C9";
		tempCtx.fillRect(12, 12, 56, 56);

		ctx.drawImage(tempCanvas, 0, 0);

		const lineImg = new Image();
		lineImg.src = "resource/image/dino_line.png";
		lineImg.onload = function() {
			const tempLineCanvas = document.createElement("canvas");
			tempLineCanvas.width = 80;
			tempLineCanvas.height = 80;
			const tempLineCtx = tempLineCanvas.getContext("2d");

			tempLineCtx.drawImage(lineImg, 12, 12, 56, 56);
			if (isWhiteLine === true || isWhiteLine === "white" || isWhiteLine === "true") {
				tempLineCtx.globalCompositeOperation = "source-in";
				tempLineCtx.fillStyle = "#FFFFFF";
				tempLineCtx.fillRect(12, 12, 56, 56);
			}

			ctx.drawImage(tempLineCanvas, 0, 0);
		};
	};
};

window.pregenerateAllUserAvatars = function(callback) {
	let usersCache = [];
	const cached = localStorage.getItem("dinerUsersCache");
	if (cached) {
		try {
			usersCache = JSON.parse(cached);
		} catch(e) {}
	}

	const savedUserStr = localStorage.getItem("dinerUserInfo");
	if (savedUserStr) {
		const userInfo = JSON.parse(savedUserStr);
		const myNickname = localStorage.getItem("dinerUserNickname");
		const myBody = localStorage.getItem("dinoBodyColor") || "#A3D9C9";
		const myBg = localStorage.getItem("dinoBgColor") || "#FAF8F5";
		const myLine = localStorage.getItem("dinoLineColor") || "black";
		if (!usersCache.some(u => u.Email === userInfo.email)) {
			usersCache.push({
				Email: userInfo.email,
				Nickname: myNickname || userInfo.name,
				DinoBodyColor: myBody,
				DinoBgColor: myBg,
				DinoLineColor: myLine
			});
		}
	}

	if (!usersCache.some(u => u.Nickname === "default")) {
		usersCache.push({
			Nickname: "default",
			DinoBodyColor: "#A3D9C9",
			DinoBgColor: "#FAF8F5",
			DinoLineColor: "black"
		});
	}

	let remaining = usersCache.length;
	if (remaining === 0) {
		if (callback) callback();
		return;
	}

	usersCache.forEach(user => {
		if (typeof generateDinoAvatar === "function") {
			generateDinoAvatar(user.DinoBodyColor, user.DinoBgColor, user.DinoLineColor || "black", function() {
				remaining--;
				if (remaining === 0 && callback) {
					callback();
				}
			});
		} else {
			remaining--;
			if (remaining === 0 && callback) {
				callback();
			}
		}
	});
};