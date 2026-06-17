import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "./store";

/**
 * Typed Redux hooks. Components must use these instead of the raw
 * `useDispatch` / `useSelector` so dispatch knows about thunks and selectors
 * are typed against `RootState`.
 */
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
