/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export function createPressGuard(delay = 260) {
    let sx = 0;
    let sy = 0;
    let timer;
    return {
        down(e) { sx = e.clientX; sy = e.clientY; },
        moved(e, tol = 4) { return Math.hypot(e.clientX - sx, e.clientY - sy) > tol; },
        single(action) {
            window.clearTimeout(timer);
            timer = setTimeout(action, delay);
        },
        cancelPending() { window.clearTimeout(timer); },
    };
}
/** 键盘派生的 click（detail===0）不走手势守卫：无坐标语义，直认单击 */
export function isKeyboardClick(e) {
    return e.detail === 0;
}
