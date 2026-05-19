document.addEventListener("DOMContentLoaded", () => {
	const { createApp } = Vue;
	const { createRouter, createWebHashHistory } = VueRouter;

	const AsyncComponent = {
		template: "<div v-html='loadedTemplate'></div>",
		data() {
			return {
				loadedTemplate: "<p>Loading...</p>", // 기본 로딩 메시지
			};
		},
		async mounted() {
			await this.loadTemplate(this.$route.path);
		},
		watch: {
			"$route.path": {
				immediate: true,
				handler(newPath) {
					this.loadTemplate(newPath);
					this.updateHeaderTitle(newPath);
				}
			}
		},
		methods: {
			async loadTemplate(path) {
				const templateMap = {
					"/main": "web/main.html",
					"/schedule": "web/schedule.html",
					"/calendar": "web/calendar.html",
				};
				const url = templateMap[path] || "web/404.html"; // 경로가 없으면 404 페이지

				try {
					const response = await fetch(url);
					if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
					this.loadedTemplate = await response.text();
					this.$nextTick(() => {
						if (window.ps) {
							window.ps.update();
						}
					});
				} catch (error) {
					console.error(`🚨 Error fetching ${url}:`, error);
					this.loadedTemplate = "<p>Error loading page.</p>";
				}
			},
			updateHeaderTitle(path) {
				const titleMap = {
					"/main": "",
					"/schedule": "일정",
					"/calendar": "캘린더",
				};
				const titleText = titleMap[path];

				// header의 title 클래스를 가진 요소에 변경된 제목을 설정
				const titleElement = document.querySelector("header .title");
				if (titleElement) {
					titleElement.textContent = titleText;
				}
			}
		}
	};

	const routes = [
		{ path: "/", redirect: "/main" },
		{ path: "/main", component: AsyncComponent },
		{ path: "/schedule", component: AsyncComponent },
		{ path: "/calendar", component: AsyncComponent },
		{ path: "/:pathMatch(.*)*", redirect: "/main" }
	];

	const router = createRouter({
		history: createWebHashHistory(),
		routes
	});

	const app = createApp({});
	app.use(router);
	app.mount("#app");
	const container = document.querySelector("#main-container");
	if (container) {
		window.ps = new PerfectScrollbar(container, {
			wheelSpeed: 1,
			wheelPropagation: true,
			minScrollbarLength: 20
		});
	}
});
