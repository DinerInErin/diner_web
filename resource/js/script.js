let CLIENT_ID;
let CLIENT_KEY;
let GAS_URL = 'https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec';
window.isFirstLoad = true;
window.needsServerSync = true;

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


            const MORE_LINK_SELECTOR = ".fc-more-link, .fc-daygrid-more-link";

            function isMoreLinkTarget(target) {
                return target && target.closest && target.closest(MORE_LINK_SELECTOR);
            }

            calendarEl.addEventListener("touchstart", function(e) {
                const dayCell = e.target.closest(".fc-daygrid-day");
                if (!dayCell) return;

                if (isMoreLinkTarget(e.target)) return;

                if (e.target.closest(".fc-event")) return;

                const touch = e.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                touchStartTime = Date.now();
            }, { passive: true });

            calendarEl.addEventListener("touchend", function(e) {
                const dayCell = e.target.closest(".fc-daygrid-day");
                if (!dayCell) return;

                if (window.moreLinkTouched || isMoreLinkTarget(e.target)) return;

                if (e.target.closest(".fc-event")) return;

                const touch = e.changedTouches[0];
                const diffX = Math.abs(touch.clientX - touchStartX);
                const diffY = Math.abs(touch.clientY - touchStartY);
                const diffTime = Date.now() - touchStartTime;

                if (diffX < 12 && diffY < 12 && diffTime < 500) {
                    const dateStr = dayCell.getAttribute("data-date");
                    if (dateStr) {
                        e.preventDefault();
                        handleDateRangeSelect(dateStr, dateStr);
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
                moreLinkClick: function(info) {
                    if (info.jsEvent) {
                        info.jsEvent.stopPropagation();
                        if (info.jsEvent.stopImmediatePropagation) {
                            info.jsEvent.stopImmediatePropagation();
                        }
                    }

                    window.moreLinkTouched = true;
                    setTimeout(function() {
                        window.moreLinkTouched = false;
                    }, 500);

                    return "popover";
                },
				dayHeaderFormat: {
					weekday: 'short'
				},
				datesSet: function (dateInfo) {
					const titleEl = document.getElementById("calendarTitle");
					if (titleEl && window.appCalendar) {
						titleEl.textContent = window.appCalendar.view.title;
					}
				},
				events: function (info, successCallback, failureCallback) {
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

					if ((window.activeMutationsCount || 0) > 0) {
						return;
					}

					if (!window.needsServerSync) {
						return;
					}

					window.needsServerSync = false;

					if (window.isFirstLoad) {
						showLoadingToast("캘린더 최신 정보를 동기화하는 중입니다...");
					} else if (!hasCache) {
						showLoadingToast("캘린더 데이터를 로딩 중입니다...");
					}

					fetch(GAS_URL)
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

									const savedUserStr = localStorage.getItem("dinerUserInfo");
									if (savedUserStr) {
										try {
											const userInfo = JSON.parse(savedUserStr);
                                            const dbUser = data.users.find(u => u.email === userInfo.email);

                                            if (dbUser) {
                                                applyUserProfileToLocal(userInfo, dbUser);
                                            }
										} catch (e) {
											console.error("Failed to sync current user profile with server data", e);
										}
									}
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
                    const target = info.jsEvent && info.jsEvent.target;
                    if (window.moreLinkTouched || isMoreLinkTarget(target)) {
                        return;
                    }
                    handleDateRangeSelect(info.dateStr, info.dateStr);
                },
                eventClick: function (info) {
                    if (window.moreLinkTouched) return;

                    const jsEvent = info.jsEvent;
                    const target = jsEvent && jsEvent.target;

                    if (target && isMoreLinkTarget(target)) {
                        return;
                    }

                    const dateStr = info.event.startStr.split('T')[0];

                    // handleDateOrEventClick(dateStr);
                    handleDateRangeSelect(dateStr, dateStr);
                },
				eventContent: function (arg) {
					const eventTitle = arg.event.title || arg.event.extendedProps.name;
					const eventOrigName = arg.event.extendedProps.originalName;
					let usersCache = [];
					try {
						usersCache = JSON.parse(localStorage.getItem("dinerUsersCache") || "[]");
					} catch(e) {}

                    const user = usersCache.find(u =>
                        (eventTitle && u.nickname === eventTitle) ||
                        (eventOrigName && u.nickname === eventOrigName) ||
                        (eventOrigName && u.email === eventOrigName)
                    );

                    let bodyColor = "#A3D9C9";
                    let bgColor = "#FAF8F5";
                    let isWhiteLine = "black";

                    if (user) {
                        bodyColor = user.dinoBodyColor || "#A3D9C9";
                        bgColor = user.dinoBgColor || "#FAF8F5";
                        isWhiteLine = user.dinoLineColor || "black";
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
                    const displayName = user ? user.nickname : eventTitle;
					let imgHtml = `<div class="d-flex align-items-center fc-event-wrapper"><img src="${profileImage}" class="shadow-sm fc-event-avatar" data-bs-toggle="tooltip" data-bs-placement="top" title="${memo || displayName}"><span class="fc-event-title-text" style="display: none;">${displayName}</span></div>`;

					return { html: imgHtml };
				},
				eventDidMount: function (info) {
					const tooltipEl = info.el.querySelector('[data-bs-toggle="tooltip"]');
					if (tooltipEl && info.event.extendedProps.reason) {
						const tooltip = new bootstrap.Tooltip(tooltipEl, {
							trigger: 'hover focus'
						});

						let pressTimer;
						tooltipEl.addEventListener('touchstart', function (e) {
							pressTimer = setTimeout(function () {
								window.isLongPressActive = true;
								tooltip.show();
								setTimeout(() => { tooltip.hide(); }, 2500);
							}, 600);
						}, { passive: true });

						tooltipEl.addEventListener('touchend', function (e) {
							clearTimeout(pressTimer);
							if (window.isLongPressActive) {
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
                    if (info.view.type === "dayGridMonth") {
                        return {
                            html: info.dayNumberText.replace("일", "")
                        };
                    }
                    return {
                        domNodes: []
                    };
                },
			});
			window.appCalendar.render();

			const calendarContainer = document.getElementById('calendar');
			if (calendarContainer) {
				let _moreTouchTarget = null;
				let _moreTouchStartX = 0;
				let _moreTouchStartY = 0;
				let _moreTouchMoved = false;

				calendarContainer.addEventListener('touchstart', function(e) {
					const t = e.touches[0];
					_moreTouchStartX = t.clientX;
					_moreTouchStartY = t.clientY;
					_moreTouchMoved = false;
					_moreTouchTarget = e.target.closest('.fc-more-link, .fc-daygrid-more-link');
					if (_moreTouchTarget) {
						window.moreLinkTouched = true;
						setTimeout(function() { window.moreLinkTouched = false; }, 800);
					}
				}, { passive: true });

				calendarContainer.addEventListener('touchmove', function(e) {
					const t = e.touches[0];
					const dx = Math.abs(t.clientX - _moreTouchStartX);
					const dy = Math.abs(t.clientY - _moreTouchStartY);
					if (dx > 10 || dy > 10) {
						_moreTouchMoved = true;
					}
				}, { passive: true });

                calendarContainer.addEventListener('touchend', function(e) {
                    if (!_moreTouchMoved && _moreTouchTarget) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.stopImmediatePropagation) {
                            e.stopImmediatePropagation();
                        }
                        _moreTouchTarget.click();
                    }
                    _moreTouchTarget = null;
                }, { passive: false });
			}

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

			const modalEl = document.getElementById("eventModal");
			const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
			if (modal) modal.hide();

			const userInfo = JSON.parse(savedUserStr);
			const savedNickname = localStorage.getItem("dinerUserNickname");
			const savedProfileImage = localStorage.getItem("dinerUserProfileImage");

			let datesToSave = [];
			if (window.dragSelectedDates && window.dragSelectedDates.length > 0) {
				datesToSave = window.dragSelectedDates;
				window.dragSelectedDates = null;
			} else {
				datesToSave = [document.getElementById("selectedDate").value];
			}

			window.activeMutationsCount = (window.activeMutationsCount || 0) + 1;

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

			if (window.appCalendar) {
				window.appCalendar.refetchEvents();
			}

			window.pendingSuccessMessage = datesToSave.length > 1 
				? `${datesToSave.length}개의 참석 체크가 완료되었습니다!` 
				: "참석 체크가 완료되었습니다!";
			showLoadingToast("참석 정보를 저장 중입니다...");

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

				return fetch(GAS_URL, {
					method: "POST",
					headers: { "Content-Type": "text/plain;charset=utf-8" },
					body: JSON.stringify(payload)
				}).then(res => res.json());
			});

			Promise.all(savePromises)
				.then(results => {
					window.activeMutationsCount = Math.max(0, (window.activeMutationsCount || 1) - 1);
					const allSuccess = results.every(res => res.success);

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
								}, 500);
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

			const modalEl = document.getElementById("deleteEventModal");
			const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
			if (modal) modal.hide();

			const userInfo = JSON.parse(savedUserStr);

			window.activeMutationsCount = (window.activeMutationsCount || 0) + 1;

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

			fetch(GAS_URL, {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify(payload)
			})
				.then(res => res.json())
				.then(data => {
					window.activeMutationsCount = Math.max(0, (window.activeMutationsCount || 1) - 1);

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
								}, 500);
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
        const bodyColor = normalizeHexColor(localStorage.getItem("dinoBodyColor"), "#A3D9C9");
        const bgColor = normalizeHexColor(localStorage.getItem("dinoBgColor"), "#FAF8F5");

        localStorage.setItem("dinoBodyColor", bodyColor);
        localStorage.setItem("dinoBgColor", bgColor);

		document.getElementById("user-name").textContent = savedNickname || userInfo.name;
		if (savedNickname) {
			document.getElementById("user-nickname").innerHTML = savedNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
		}
		
		if (typeof generateDinoAvatar === "function") {
            const lineColor = localStorage.getItem("dinoLineColor") || "black";
            generateDinoAvatar(bodyColor, bgColor, lineColor, function(avatarUrl) {
                localStorage.setItem("dinerUserProfileImage", avatarUrl);
                document.getElementById("profile-img").src = avatarUrl;
            });
		}

		// document.getElementById("login-btn-area").classList.add("hidden");
		// document.getElementById("user-info").classList.remove("hidden");
        showLoggedInArea();
	}

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
            const bodyColor = normalizeHexColor(localStorage.getItem("dinoBodyColor"), "#A3D9C9");
            const bgColor = normalizeHexColor(localStorage.getItem("dinoBgColor"), "#FAF8F5");
            const lineColor = localStorage.getItem("dinoLineColor") || "black";

            localStorage.setItem("dinoBodyColor", bodyColor);
            localStorage.setItem("dinoBgColor", bgColor);

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

            const bodyColor = normalizeHexColor(document.getElementById("dinoBodyColor").value, "#A3D9C9");
            const bgColor = normalizeHexColor(document.getElementById("dinoBgColor").value, "#FAF8F5");
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
				fetch(GAS_URL, {
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
                                const userIdx = usersCache.findIndex(u => getUserEmail(u) === userInfo.email);

                                const updatedUser = {
                                    email: userInfo.email,
                                    nickname: newNickname,
                                    dinoBodyColor: bodyColor,
                                    dinoBgColor: bgColor,
                                    dinoLineColor: lineColor
                                };
                                if (userIdx !== -1) {
                                    usersCache[userIdx] = { ...usersCache[userIdx], ...updatedUser };
                                } else {
                                    usersCache.push(updatedUser);
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
        client_id: "143675790537-5f95f3pftgbtk5c72higjtq4bsimukfc.apps.googleusercontent.com",
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
    });

    const googleSignInButtonEl = document.getElementById("googleSignInButton");

    if (googleSignInButtonEl && window.google && google.accounts && google.accounts.id) {
        google.accounts.id.renderButton(
            googleSignInButtonEl,
            {
                type: "standard",
                theme: "outline",
                size: "large",
                text: "signin_with",
                shape: "pill",
                logo_alignment: "left"
            }
        );
    }

	// document.getElementById("login-btn").addEventListener("click", function () {
	// 	const sidebar = document.getElementById("sidebar");
	// 	const sidebarOverlay = document.getElementById("sidebar-overlay");
	// 	if (sidebar && sidebarOverlay) {
	// 		sidebar.classList.remove("active");
	// 		sidebarOverlay.classList.remove("active");
	// 	}
	// 	google.accounts.id.prompt();
	// });


	const logoutBtn = document.getElementById("logout-btn");
    logoutBtn.addEventListener("click", function () {
        if (window.google && google.accounts && google.accounts.id) {
            google.accounts.id.disableAutoSelect();
        }

        localStorage.removeItem("dinerUserInfo");
        // localStorage.removeItem("dinerUserNickname");
        // localStorage.removeItem("dinerUserProfileImage");
        // localStorage.removeItem("dinoBodyColor");
        // localStorage.removeItem("dinoBgColor");
        // localStorage.removeItem("dinoLineColor");

        // localStorage.removeItem("dinerUsersCache");
        // localStorage.removeItem("dinerEventsCache");
        // localStorage.removeItem("dinerSchedulesCache");

        showLoggedOutArea();
        closeSidebar();

        showToast("로그아웃되었습니다.", "info", 1500);
    });
};

function handleCredentialResponse(response) {
    console.log("GSI credential response:", response);

    if (!response || !response.credential) {
        console.error("Google credential이 없습니다.", response);
        showToast("로그인 정보를 받지 못했습니다.", "danger");
        return;
    }

    updateUserProfile(response.credential);
}

function getUserEmail(u) {
    return u.email || u.Email;
}

function getUserNickname(u) {
    return u.nickname || u.Nickname;
}

function getUserBodyColor(u) {
    return u.dinoBodyColor || u.DinoBodyColor;
}

function getUserBgColor(u) {
    return u.dinoBgColor || u.DinoBgColor;
}

function getUserLineColor(u) {
    return u.dinoLineColor || u.DinoLineColor || "black";
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function findUserByEmail(users, email) {
    const targetEmail = normalizeEmail(email);
    return (users || []).find(u => normalizeEmail(getUserEmail(u)) === targetEmail);
}

function normalizeHexColor(value, fallback) {
    const str = String(value || "").trim();

    if (/^#[0-9a-fA-F]{6}$/.test(str)) {
        return str;
    }

    if (/^#[0-9a-fA-F]{3}$/.test(str)) {
        return "#" + str.slice(1).split("").map(ch => ch + ch).join("");
    }

    return fallback;
}

async function fetchUsersFromServer() {
    const res = await fetch(GAS_URL);
    const data = await res.json();

    if (data.users) {
        localStorage.setItem("dinerUsersCache", JSON.stringify(data.users));
    }

    if (data.events) {
        localStorage.setItem("dinerEventsCache", JSON.stringify(data.events));
    }

    if (data.schedules) {
        localStorage.setItem("dinerSchedulesCache", JSON.stringify(data.schedules));
    }

    return data.users || [];
}

function closeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebar-overlay");

    if (sidebar && sidebarOverlay) {
        sidebar.classList.remove("active");
        sidebarOverlay.classList.remove("active");
    }
}

function showLoggedInArea() {
    const loginArea = document.getElementById("login-btn-area");
    const userInfoArea = document.getElementById("user-info");

    if (loginArea) {
        loginArea.classList.add("hidden");
        loginArea.style.display = "none";
    }

    if (userInfoArea) {
        userInfoArea.classList.remove("hidden");
        userInfoArea.style.display = "flex";
    }
}

function showLoggedOutArea() {
    const loginArea = document.getElementById("login-btn-area");
    const userInfoArea = document.getElementById("user-info");

    if (loginArea) {
        loginArea.classList.remove("hidden");
        loginArea.style.display = "";
    }

    if (userInfoArea) {
        userInfoArea.classList.add("hidden");
        userInfoArea.style.display = "none";
    }
}

function applyTemporaryGoogleProfile(userInfo) {
    const fallbackName = userInfo.name || userInfo.email || "사용자";
    const nickname = localStorage.getItem("dinerUserNickname") || fallbackName;
    const bodyColor = normalizeHexColor(localStorage.getItem("dinoBodyColor"), "#D0D0D0");
    const bgColor = normalizeHexColor(localStorage.getItem("dinoBgColor"), "#EAEAEA");
    const lineColor = localStorage.getItem("dinoLineColor") || "black";

    localStorage.setItem("dinerUserNickname", nickname);
    localStorage.setItem("dinoBodyColor", bodyColor);
    localStorage.setItem("dinoBgColor", bgColor);
    localStorage.setItem("dinoLineColor", lineColor);

    const nameEl = document.getElementById("user-name");
    const nicknameEl = document.getElementById("user-nickname");

    if (nameEl) nameEl.textContent = nickname;
    if (nicknameEl) {
        nicknameEl.innerHTML =
            nickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';
    }

    if (typeof generateDinoAvatar === "function") {
        generateDinoAvatar(bodyColor, bgColor, lineColor, function(avatarUrl) {
            localStorage.setItem("dinerUserProfileImage", avatarUrl);

            const profileImgEl = document.getElementById("profile-img");
            if (profileImgEl) {
                profileImgEl.src = avatarUrl;
            }
        });
    }
}

async function updateUserProfile(idToken) {
    try {
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        const userInfo = await tokenInfoRes.json();

        if (!userInfo || !userInfo.email) {
            console.error("Invalid tokeninfo response:", userInfo);
            showToast("로그인 정보를 확인하지 못했습니다.", "danger");
            return;
        }

        localStorage.setItem("dinerUserInfo", JSON.stringify(userInfo));

        // 여기서 먼저 로그인 UI로 전환
        applyTemporaryGoogleProfile(userInfo);
        showLoggedInArea();
        closeSidebar();

        let usersCache = [];

        try {
            usersCache = await fetchUsersFromServer();
        } catch (e) {
            console.warn("서버 users 동기화 실패. localStorage cache로 대체합니다.", e);
            try {
                usersCache = JSON.parse(localStorage.getItem("dinerUsersCache") || "[]");
            } catch (_) {
                usersCache = [];
            }
        }

        const dbUser = findUserByEmail(usersCache, userInfo.email);

        if (dbUser) {
            // 서버에 기존 유저가 있으면 실제 프로필로 보정
            applyUserProfileToLocal(userInfo, dbUser);
        } else {
            // 서버에 없을 때만 신규 프로필 생성 + 모달
            createNewUserProfile(userInfo);
        }

    } catch (error) {
        console.error("Failed to fetch user info:", error);
        showToast("로그인 정보를 불러오지 못했습니다.", "danger");
    }
}

function applyUserProfileToLocal(userInfo, dbUser) {
    const nickname = getUserNickname(dbUser);
    const bodyColor = normalizeHexColor(getUserBodyColor(dbUser), "#A3D9C9");
    const bgColor = normalizeHexColor(getUserBgColor(dbUser), "#FAF8F5");
    const lineColor = getUserLineColor(dbUser);

    localStorage.setItem("dinerUserNickname", nickname);
    localStorage.setItem("dinoBodyColor", bodyColor);
    localStorage.setItem("dinoBgColor", bgColor);
    localStorage.setItem("dinoLineColor", lineColor);

    document.getElementById("user-name").textContent = nickname;
    document.getElementById("user-nickname").innerHTML =
        nickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';

    if (typeof generateDinoAvatar === "function") {
        generateDinoAvatar(bodyColor, bgColor, lineColor, function(avatarUrl) {
            localStorage.setItem("dinerUserProfileImage", avatarUrl);

            const profileImgEl = document.getElementById("profile-img");
            if (profileImgEl) {
                profileImgEl.src = avatarUrl;
            }
        });
    }
}

function createNewUserProfile(userInfo) {
    const newNickname = userInfo.name;
    const bodyColor = "#D0D0D0";
    const bgColor = "#EAEAEA";
    const lineColor = "black";

    localStorage.setItem("dinerUserNickname", newNickname);
    localStorage.setItem("dinoBodyColor", bodyColor);
    localStorage.setItem("dinoBgColor", bgColor);
    localStorage.setItem("dinoLineColor", lineColor);

    document.getElementById("user-name").textContent = newNickname;
    document.getElementById("user-nickname").innerHTML =
        newNickname + ' <span class="material-symbols-outlined" style="font-size: 12px; vertical-align: middle;">edit</span>';

    if (typeof generateDinoAvatar === "function") {
        generateDinoAvatar(bodyColor, bgColor, lineColor, function(avatarUrl) {
            localStorage.setItem("dinerUserProfileImage", avatarUrl);
            document.getElementById("profile-img").src = avatarUrl;
        });
    }

    fetch(GAS_URL, {
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
                try {
                    usersCache = JSON.parse(localStorage.getItem("dinerUsersCache") || "[]");
                } catch(e) {}

                const userIdx = usersCache.findIndex(u => getUserEmail(u) === userInfo.email);
                const newUserData = {
                    email: userInfo.email,
                    nickname: newNickname,
                    dinoBodyColor: bodyColor,
                    dinoBgColor: bgColor,
                    dinoLineColor: lineColor
                };

                if (userIdx !== -1) {
                    usersCache[userIdx] = newUserData;
                } else {
                    usersCache.push(newUserData);
                }

                localStorage.setItem("dinerUsersCache", JSON.stringify(usersCache));
            }
        })
        .catch(err => console.error("GAS auto register fail:", err));

    setTimeout(() => {
        const nicknameModalEl = document.getElementById("nicknameModal");
        if (nicknameModalEl) {
            const modal = bootstrap.Modal.getInstance(nicknameModalEl) || bootstrap.Modal.getOrCreateInstance(nicknameModalEl);
            if (modal) modal.show();
        }
    }, 500);
}

let loadingToastInstance = null;

function closeMorePopover() {
    const closeBtn = document.querySelector(".fc-popover .fc-popover-close");
    if (closeBtn) {
        closeBtn.click();
    }

    document.querySelectorAll(".fc-popover").forEach(popover => popover.remove());

    document
        .querySelectorAll(".fc-more-link[aria-expanded='true'], .fc-daygrid-more-link[aria-expanded='true']")
        .forEach(link => {
            link.setAttribute("aria-expanded", "false");
        });

    window.moreLinkTouched = false;
}

function formatKoreanDateTitle(dateStr) {
    if (!dateStr) return "";

    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    const date = new Date(year, month - 1, day);
    const week = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];

    return `${year}년 ${month}월 ${day}일 (${week})`;
}

function setAttendanceModalTitle(modalId, dateText, mode) {
    const titleEl = document.querySelector(`#${modalId} .modal-title`);
    if (!titleEl) return;

    const icon = mode === "delete" ? "event_busy" : "event_available";
    const label = mode === "delete" ? "참석 취소" : "참석 등록";

    titleEl.innerHTML = `
		<span class="material-symbols-outlined align-middle me-1">${icon}</span>
		${dateText} ${label}
	`;
}

function showAddEventModal(dateStr) {
    closeMorePopover();

    const dateText = formatKoreanDateTitle(dateStr);
    setAttendanceModalTitle("eventModal", dateText, "add");

    $("#selectedDate").val(dateStr);
    $("#eventModal").modal("show");
}

function showDeleteEventModal(dateStr) {
    closeMorePopover();

    const dateText = formatKoreanDateTitle(dateStr);
    setAttendanceModalTitle("deleteEventModal", dateText, "delete");

    $("#deleteEventDate").val(dateStr);
    $("#deleteEventModal").modal("show");
}

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
            showDeleteEventModal(clickedDateStr);
        } else {
            showAddEventModal(clickedDateStr);
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

        closeMorePopover();

        const firstDateText = formatKoreanDateTitle(datesToSave[0]);
        const titleEl = document.querySelector("#eventModal .modal-title");
        if (titleEl) {
            titleEl.innerHTML = `
		<span class="material-symbols-outlined align-middle me-1">event_available</span>
		${firstDateText} 외 ${datesToSave.length - 1}일 참석 등록
	`;
        }

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
    //
	// const parts = clickedDateStr.split("-");
	// const formattedDate = `${parseInt(parts[1])}월 ${parseInt(parts[2])}일 참석 희망자 목록 (${dailyEvents.length}명)`;
	//
	// const titleEl = document.getElementById("selected-date-title");
	// if (titleEl) {
	// 	titleEl.textContent = formattedDate;
	// }

	const listEl = document.getElementById("daily-events-list");
	if (listEl) {
		listEl.innerHTML = "";
		// if (dailyEvents.length === 0) {
		// 	listEl.innerHTML = `<div class="text-center text-muted py-3 fs-7">등록된 참석 희망자가 없습니다.</div>`;
		// } else {
			dailyEvents.forEach(event => {
				const eventTitle = event.title || event.extendedProps.name;
				const eventOrigName = event.extendedProps.originalName;
				let usersCache = [];
				try {
					usersCache = JSON.parse(localStorage.getItem("dinerUsersCache") || "[]");
				} catch(e) {}

                const user = usersCache.find(u =>
                    (eventTitle && u.nickname === eventTitle) ||
                    (eventOrigName && u.nickname === eventOrigName) ||
                    (eventOrigName && u.email === eventOrigName)
                );
				let bodyColor = "#A3D9C9";
				let bgColor = "#FAF8F5";
				let isWhiteLine = "black";

                if (user) {
                    bodyColor = user.dinoBodyColor || "#A3D9C9";
                    bgColor = user.dinoBgColor || "#FAF8F5";
                    isWhiteLine = user.dinoLineColor || "black";
                } else {
					if (eventTitle === currentName || eventTitle === currentNickname || eventOrigName === currentName) {
						bodyColor = localStorage.getItem("dinoBodyColor") || "#A3D9C9";
						bgColor = localStorage.getItem("dinoBgColor") || "#FAF8F5";
						isWhiteLine = localStorage.getItem("dinoLineColor") || "black";
					}
				}

                const cacheKey = `${bodyColor}_${bgColor}_${isWhiteLine}`;
                let profileImage = window.dinoAvatarCache[cacheKey] || "resource/image/default-profile.png";
                const eventOwner = (user && user.nickname) || event.extendedProps.nickname || event.extendedProps.name || event.title || "이름 없음";
                const memo = event.extendedProps.reason || "";

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
		// }
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
    showAddEventModal(dateStr);
};

window.triggerDeleteEvent = function(dateStr) {
    showDeleteEventModal(dateStr);
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

function renderConfirmedDateBadges(events) {
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
					badge.title = '확정';
					cellTop.appendChild(badge);
				}
			}
		}
	}
}

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

	fetchSchedulesAndEventsFromServer(range.start, range.end);

	const form = document.getElementById("new-schedule-form");
	if (form) {
		form.onsubmit = function (e) {
			e.preventDefault();
			const dateVal = document.getElementById("sched-date").value;
			const timeVal = document.getElementById("sched-time").value || "21:00";
			const titleVal = document.getElementById("sched-title").value;
			
			const checkedCheckboxes = document.querySelectorAll('.sched-user-checkbox:checked');
			const attendeesVal = Array.from(checkedCheckboxes).map(cb => cb.value).join(", ");

			const savedUserStr = localStorage.getItem("dinerUserInfo");
			if (!savedUserStr) {
				showToast("로그인이 필요합니다. 먼저 로그인을 진행해주세요.", "danger");
				return;
			}

			showLoadingToast("새 일정을 등록하는 중입니다...");

			const idVal = "manual_" + Date.now();
			const userInfo = JSON.parse(savedUserStr);
			const createdByVal = userInfo.nickname || userInfo.name || userInfo.email || "User";

			const payload = {
				action: "saveSchedule",
				id: idVal,
				date: dateVal,
				time: timeVal,
				title: titleVal,
				createdBy: createdByVal,
				participants: attendeesVal,
				type: "manual"
			};

			fetch(GAS_URL, {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify(payload)
			})
				.then(res => res.json())
				.then(data => {
					if (data.success) {
						document.getElementById("sched-title").value = "";
						document.querySelectorAll('.sched-user-checkbox').forEach(cb => cb.checked = false);
						showToast("일정이 등록되었습니다!", "success");

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

	const saveEditBtn = document.getElementById("saveEditScheduleBtn");
	if (saveEditBtn) {
		saveEditBtn.onclick = function () {
			const idVal = document.getElementById("edit-sched-id").value;
			const titleVal = document.getElementById("edit-sched-title").value;
			const dateVal = document.getElementById("edit-sched-date").value;
			const timeVal = document.getElementById("edit-sched-time").value || "21:00";

			if (!titleVal.trim()) {
				showToast("일정 이름을 입력해 주세요.", "danger");
				return;
			}
			if (!dateVal) {
				showToast("날짜를 입력해 주세요.", "danger");
				return;
			}

			const checkedCheckboxes = document.querySelectorAll('.edit-sched-user-checkbox:checked');
			const participantsVal = Array.from(checkedCheckboxes).map(cb => cb.value).join(", ");

			const modalEl = document.getElementById("editScheduleModal");
			const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
			if (modal) modal.hide();

			showLoadingToast("일정을 수정하는 중입니다...");

			const payload = {
				action: "updateSchedule",
				id: idVal,
				title: titleVal,
				date: dateVal,
				time: timeVal,
				participants: participantsVal
			};

			fetch(GAS_URL, {
				method: "POST",
				headers: { "Content-Type": "text/plain;charset=utf-8" },
				body: JSON.stringify(payload)
			})
				.then(res => res.json())
				.then(data => {
					if (data.success) {
						showToast("일정이 수정되었습니다!", "success");
						fetchSchedulesAndEventsFromServer(range.start, range.end);
					} else {
						hideLoadingToast();
						showToast("일정 수정 실패: " + data.error, "danger");
					}
				})
				.catch(err => {
					console.error(err);
					hideLoadingToast();
					showToast("일정 수정 중 오류가 발생했습니다.", "danger");
				});
		};
	}

    const editTimeInput = document.getElementById("edit-sched-time");
    const editTimeLabelEl = document.getElementById("edit-sched-time-label");

    if (editTimeInput && editTimeLabelEl && !editTimeInput.dataset.labelBound) {
        editTimeInput.dataset.labelBound = "true";
        editTimeInput.addEventListener("input", function () {
            editTimeLabelEl.textContent = formatScheduleTimeLabel(editTimeInput.value || "21:00");
        });
    }
}

function fetchSchedulesAndEventsFromServer(start, end) {
	const listEl = document.getElementById("schedule-list");
	if (listEl) {
		listEl.innerHTML = `
			<div class="text-center py-5 text-secondary border rounded-4 bg-light">
				<div class="spinner-border spinner-border-sm text-primary" role="status"></div>
				<div class="mt-2 fw-semibold">일정을 동기화하는 중입니다.</div>
			</div>
		`;
	}

	fetch(GAS_URL)
		.then(res => res.json())
		.then(data => {
			hideLoadingToast();
			let eventsArray = [];
			let schedulesArray = [];
			if (data && data.events) {
				eventsArray = data.events;
				schedulesArray = data.schedules;

				localStorage.setItem("dinerEventsCache", JSON.stringify(eventsArray));
				localStorage.setItem("dinerSchedulesCache", JSON.stringify(schedulesArray));

				populateAttendeesSelector(eventsArray);
				
				renderSchedulesList(schedulesArray, start, end);
			}
		})
		.catch(err => {
			console.error(err);
			hideLoadingToast();
			showToast("일정 동기화에 실패했습니다.", "danger");
		});
}

function formatScheduleTimeLabel(timeVal) {
    const normalized = normalizeScheduleTime(timeVal);
    const [hourStr, minuteStr] = normalized.split(":");

    let hour = Number(hourStr);
    const minute = Number(minuteStr);

    const ampm = hour >= 12 ? "오후" : "오전";
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12;

    if (minute === 0) {
        return `${ampm} ${displayHour}시`;
    }

    return `${ampm} ${displayHour}시 ${minute}분`;
}

function normalizeScheduleTime(timeVal) {
    if (!timeVal) return "21:00";

    const str = String(timeVal).trim();

    const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
        return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
    }

    const isoTimeMatch = str.match(/T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{3})?)?Z$/);
    if (isoTimeMatch) {
        const utcHour = Number(isoTimeMatch[1]);
        const minute = isoTimeMatch[2];

        const kstHour = (utcHour + 9) % 24;

        return `${String(kstHour).padStart(2, "0")}:${minute}`;
    }

    return "21:00";
}

function renderSchedulesList(schedules, cycleStart, cycleEnd) {
	const listEl = document.getElementById("schedule-list");
	if (!listEl) return;

	const normalizedSchedules = schedules.map(s => {
		const isReversed = s.title && s.title.includes('T') && s.date && !s.date.includes('T');
		return {
			id: s.id || '',
			title: isReversed ? s.date : (s.title || ''),
			date: isReversed ? s.title : (s.date || ''),
            time: normalizeScheduleTime(s.time),
			createdBy: isReversed ? (s.attendees || '') : (s.createdBy || ''),
			participants: isReversed ? (s.isAuto || '') : (s.participants || ''),
			type: s.type || (s.id && s.id.indexOf("auto_") === 0 ? "auto" : "manual"),
			updatedAt: s.updatedAt || ''
		};
	});

	const allowedDates = [];
	let curr = new Date(cycleStart);
	const limit = new Date(cycleEnd);
	while (curr <= limit) {
		const yyyy = curr.getFullYear();
		const mm = String(curr.getMonth() + 1).padStart(2, '0');
		const dd = String(curr.getDate()).padStart(2, '0');
		allowedDates.push(`${yyyy}-${mm}-${dd}`);
		curr.setDate(curr.getDate() + 1);
	}

	const filtered = normalizedSchedules.filter(s => {
		if (!s.date) return false;
		const datePart = s.date.split('T')[0];
		return allowedDates.includes(datePart);
	});

	filtered.sort((a, b) => a.date.localeCompare(b.date));

	if (filtered.length === 0) {
		listEl.innerHTML = `
			<div class="text-center py-5 text-secondary border rounded-4 bg-light padding-5">
				<span class="material-symbols-outlined text-muted" style="font-size: 48px;">event_busy</span>
				<div class="mt-2 fw-semibold">이번 주간에 등록된 일정이 없습니다.</div>
				<div class="small text-muted mt-1">캘린더에서 5명 이상 참석 시 자동으로 일정이 생성됩니다.</div>
				<div class="small text-muted mt-1">또는 수동으로 등록할 수도 있습니다.</div>
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

		const displayTitle = s.title || "일정";
		const isManual = s.type === "manual";

        const deleteButtonHtml = isManual
            ? `<button type="button"
			    class="btn btn-link btn-sm p-0 text-secondary d-flex align-items-center text-decoration-none"
			    onclick="deleteSchedule('${s.id}')"
			    title="일정 삭제">
			    <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
		    </button>`
            : '';

		const iconHtml = isManual
			? `<span class="material-symbols-outlined text-secondary ms-1" style="font-size: 18px; vertical-align: middle; cursor: help;" data-bs-toggle="tooltip" data-bs-title="수동 등록 일정">edit_calendar</span>`
			: '';

		html += `
			<div class="card border rounded-3 p-3 shadow-sm hover-shadow transition mb-2" style="background-color: #fcfcfc;">
				<div class="d-flex justify-content-between align-items-start gap-2">
					<div class="d-flex align-items-start gap-3" style="width: 100%;">
						<div class="text-center bg-dark text-white rounded-3 px-2 py-2 fw-bold" style="min-width: 65px; flex-shrink: 0; white-space: nowrap; align-self: center;">
							<div class="small" style="font-size: 11px;">${week}요일</div>
							<div class="fs-4 lh-1 mt-1" style="font-size: 1.25rem !important;">${mm}/${dd}</div>
						</div>
						<div style="width: 100%;">
							<div class="d-flex align-items-center gap-2" style="justify-content: space-between;">
						        <div>
						            <h5 class="fw-bold mb-0 text-dark" id="sched-title-${s.id}">${displayTitle}${iconHtml}</h5>
						        </div>
						        <div style="display: flex;">
                                    <button class="btn btn-link btn-sm p-0 text-secondary d-flex align-items-center text-decoration-none" onclick="openEditScheduleModal('${s.id}', '${displayTitle}')" title="일정 수정">
                                        <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                                    </button>
                                    ${deleteButtonHtml}
								</div>
							</div>
							<div class="d-flex align-items-center gap-1 text-secondary small mt-1">
								<span class="material-symbols-outlined text-muted" style="font-size: 16px;">schedule</span>
								<span>시간: <span class="fw-bold text-dark">${formatScheduleTimeLabel(s.time)}</span></span>
							</div>
							<div class="text-secondary small mt-2 d-flex align-items-start gap-1 flex-wrap">
								<div class="d-flex align-items-center gap-1" style="white-space: nowrap; flex-shrink: 0;">
									<span class="material-symbols-outlined text-muted" style="font-size: 16px;">group</span>
									<span class="fw-semibold text-dark">참석자:</span>
								</div>
								<span class="text-secondary text-break">${s.participants || '없음'}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;
	});

	listEl.innerHTML = html;

	if (window.activeScheduleTooltips) {
		window.activeScheduleTooltips.forEach(t => {
			try { t.dispose(); } catch (e) {}
		});
	}
	window.activeScheduleTooltips = [];

	const tooltipTriggerList = listEl.querySelectorAll('[data-bs-toggle="tooltip"]');
	window.activeScheduleTooltips = Array.from(tooltipTriggerList).map(el => new bootstrap.Tooltip(el));
}

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

	listEl.addEventListener('wheel', function(e) {
		e.stopPropagation();
	}, { passive: false });

	listEl.addEventListener('touchmove', function(e) {
		e.stopPropagation();
	}, { passive: false });
}

window.openEditScheduleModal = function (id, title) {
	const cachedSchedulesStr = localStorage.getItem("dinerSchedulesCache");
	let sched = null;
	if (cachedSchedulesStr) {
		try {
			const arr = JSON.parse(cachedSchedulesStr);
			const normalized = arr.map(s => {
				const isReversed = s.title && s.title.includes('T') && s.date && !s.date.includes('T');
				return {
					id: s.id || '',
					title: isReversed ? s.date : (s.title || ''),
					date: isReversed ? s.title : (s.date || ''),
                    time: normalizeScheduleTime(s.time),
					createdBy: isReversed ? (s.attendees || '') : (s.createdBy || ''),
					participants: isReversed ? (s.isAuto || '') : (s.participants || ''),
					type: s.type || (s.id && s.id.indexOf("auto_") === 0 ? "auto" : "manual"),
					updatedAt: s.updatedAt || ''
				};
			});
			sched = normalized.find(s => s.id === id);
            document.getElementById("edit-sched-time").value = sched.time || '21:00';
            const editTimeLabelEl = document.getElementById("edit-sched-time-label");
            if (editTimeLabelEl) {
                editTimeLabelEl.textContent = formatScheduleTimeLabel(sched.time || '21:00');
            }
		} catch(e) {
			console.error(e);
		}
	}

	if (!sched) {
		showToast("일정 정보를 찾을 수 없습니다.", "danger");
		return;
	}

	document.getElementById("edit-sched-id").value = id;
	document.getElementById("edit-sched-title").value = sched.title || '';
	document.getElementById("edit-sched-date").value = sched.date ? sched.date.split('T')[0] : '';
	document.getElementById("edit-sched-time").value = sched.time || '21:00';

	const cachedEventsStr = localStorage.getItem("dinerEventsCache");
	const editAttendeesListEl = document.getElementById("edit-sched-attendees-list");
	if (editAttendeesListEl && cachedEventsStr) {
		try {
			const events = JSON.parse(cachedEventsStr);
			const users = {};
			events.forEach(ev => {
				const displayName = ev.nickname || ev.title;
				if (displayName && displayName.trim()) {
					users[displayName.trim()] = true;
				}
			});
			const uniqueUsers = Object.keys(users).sort();
			
			const currentParticipants = sched.participants
				? sched.participants.split(',').map(p => p.trim())
				: [];

			let html = '';
			uniqueUsers.forEach((user, index) => {
				const isChecked = currentParticipants.includes(user) ? 'checked' : '';
				html += `
					<div class="form-check mb-1">
						<input class="form-check-input edit-sched-user-checkbox" type="checkbox" value="${user}" id="editUserCheck-${index}" ${isChecked}>
						<label class="form-check-label small text-dark fw-medium" for="editUserCheck-${index}" style="cursor: pointer;">
							${user}
						</label>
					</div>
				`;
			});
			editAttendeesListEl.innerHTML = html || `<span class="text-muted small">동기화된 사용자가 없습니다.</span>`;

			editAttendeesListEl.addEventListener('wheel', function(e) {
				e.stopPropagation();
			}, { passive: false });

			editAttendeesListEl.addEventListener('touchmove', function(e) {
				e.stopPropagation();
			}, { passive: false });
		} catch(e) {
			console.error(e);
		}
	}

	const modalEl = document.getElementById("editScheduleModal");
	if (modalEl && modalEl.parentNode !== document.body) {
		document.body.appendChild(modalEl);
	}

	const modal = bootstrap.Modal.getInstance(modalEl) || bootstrap.Modal.getOrCreateInstance(modalEl);
	if (modal) modal.show();
};

window.deleteSchedule = function(id) {
    if (!id) {
        showToast("삭제할 일정 정보를 찾을 수 없습니다.", "danger");
        return;
    }

    const cachedSchedulesStr = localStorage.getItem("dinerSchedulesCache");
    let targetSchedule = null;

    if (cachedSchedulesStr) {
        try {
            const schedules = JSON.parse(cachedSchedulesStr);
            targetSchedule = schedules.find(s => s.id === id);
        } catch (e) {
            console.error(e);
        }
    }

    const title = targetSchedule?.title || "이 일정";
    const ok = confirm(`"${title}" 일정을 삭제할까요?`);

    if (!ok) return;

    showLoadingToast("일정을 삭제하는 중입니다...");

    fetch("https://script.google.com/macros/s/AKfycbwHeRs4tqgNwsBIR4AVIKIAMuTTjAl6Ez4unnqWv94wfZxtbwSq-WO05w6guaiCbALelA/exec", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "deleteSchedule",
            id: id
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // 로컬 캐시에서도 먼저 제거
                const cached = localStorage.getItem("dinerSchedulesCache");
                if (cached) {
                    try {
                        let schedules = JSON.parse(cached);
                        schedules = schedules.filter(s => s.id !== id);
                        localStorage.setItem("dinerSchedulesCache", JSON.stringify(schedules));

                        const range = getCurrentCycleRange();
                        renderSchedulesList(schedules, range.start, range.end);
                    } catch (e) {
                        console.error(e);
                    }
                }

                hideLoadingToast("일정이 삭제되었습니다.");

                const range = getCurrentCycleRange();
                fetchSchedulesAndEventsFromServer(range.start, range.end);
            } else {
                hideLoadingToast();
                showToast("일정 삭제 실패: " + (data.error || "알 수 없는 오류"), "danger");
            }
        })
        .catch(err => {
            console.error(err);
            hideLoadingToast();
            showToast("일정 삭제 중 오류가 발생했습니다.", "danger");
        });
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

        if (!usersCache.some(u => u.email === userInfo.email)) {
            usersCache.push({
                email: userInfo.email,
                nickname: myNickname || userInfo.name,
                dinoBodyColor: myBody,
                dinoBgColor: myBg,
                dinoLineColor: myLine
            });
        }
    }

    if (!usersCache.some(u => u.nickname === "default")) {
        usersCache.push({
            nickname: "default",
            dinoBodyColor: "#A3D9C9",
            dinoBgColor: "#FAF8F5",
            dinoLineColor: "black"
        });
    }

    let remaining = usersCache.length;
    if (remaining === 0) {
        if (callback) callback();
        return;
    }

    usersCache.forEach(user => {
        if (typeof generateDinoAvatar === "function") {
            generateDinoAvatar(
                user.dinoBodyColor || "#A3D9C9",
                user.dinoBgColor || "#FAF8F5",
                user.dinoLineColor || "black",
                function() {
                    remaining--;
                    if (remaining === 0 && callback) {
                        callback();
                    }
                }
            );
        } else {
            remaining--;
            if (remaining === 0 && callback) {
                callback();
            }
        }
    });
};