/** 界面与设备适配相关常量。 */

/** 触屏设备判定（粗指针）。 */
export const TOUCH_MEDIA_QUERY = '(pointer: coarse)';
/** 竖屏判定。 */
export const PORTRAIT_MEDIA_QUERY = '(orientation: portrait)';

/** 设置持久化的 localStorage 键。 */
export const STORAGE_KEY_SETTINGS = 'mc.settings.v1';

/** 鼠标灵敏度可调范围与滑块步长。 */
export const MIN_MOUSE_SENSITIVITY = 0.0005;
export const MAX_MOUSE_SENSITIVITY = 0.008;
export const MOUSE_SENSITIVITY_STEP = 0.0001;

/** 触屏视角灵敏度（每像素弧度）可调范围与默认值。 */
export const MIN_TOUCH_LOOK_SENSITIVITY = 0.001;
export const MAX_TOUCH_LOOK_SENSITIVITY = 0.012;
export const DEFAULT_TOUCH_LOOK_SENSITIVITY = 0.005;
export const TOUCH_LOOK_SENSITIVITY_STEP = 0.0005;

/** 摇杆半径（px）与死区（占半径比例）。 */
export const TOUCH_JOYSTICK_RADIUS_PX = 56;
export const TOUCH_JOYSTICK_DEADZONE = 0.18;

/** 视角区轻点判定：最大位移（px）与最长时长（ms）。 */
export const TOUCH_TAP_MOVE_PX = 12;
export const TOUCH_TAP_MS = 250;

/** 容器格子长按等价右键的时长（ms）。 */
export const TOUCH_LONG_PRESS_MS = 350;
