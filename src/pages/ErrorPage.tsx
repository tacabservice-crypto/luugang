import { useRouteError } from "react-router-dom";
import { userErrorMessage } from "../utils/userError";

export default function ErrorPage() {
  const error: any = useRouteError();
  console.error(error);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Oops!</h1>
        <p className="mt-4">Sorry, an unexpected error has occurred.</p>
        <p className="mt-2">
          <i>{userErrorMessage(error, 'This page could not be opened.')}</i>
        </p>
      </div>
    </div>
  );
}
