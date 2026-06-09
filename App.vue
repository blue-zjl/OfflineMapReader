<script>
import { readConfig } from "./utils/config.js";

export default {
  onLaunch() {
    const config = readConfig();
    const hasConfig = Boolean(config && config.hasConfig);

    console.log("[App] onLaunch, 读取配置:", config);
    console.log("[App] 跳转目标:", hasConfig ? "map" : "setting");

    if (hasConfig) {
      uni.reLaunch({
        url: "/pages/map/map",
      });
    }
  },
  onShow() {
    console.log("[App] onShow");
  },
  onHide() {
    console.log("[App] onHide");
  },
};
</script>

<style></style>
