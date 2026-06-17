import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { useAppDispatch } from "./store/hooks";
import { fetchCurrentUser } from "./features/auth/authSlice";
import { router } from "./routes/router";

function App() {
  const dispatch = useAppDispatch();

  // Restore the session on load: the JWT is in an HTTP-only cookie the client
  // can't read, so ask the server who we are. Result drives the navbar (user
  // menu vs. Sign In) and survives refreshes/new tabs.
  useEffect(() => {
    void dispatch(fetchCurrentUser());
  }, [dispatch]);

  return <RouterProvider router={router} />;
}

export default App;
