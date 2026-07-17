import { useFind, useSubscribe } from "meteor/react-meteor-data/suspense";
import { LinksCollection } from "../api/links";

export const Info = () => {
  useSubscribe("links");
  const data = useFind(LinksCollection, []);

  return (
    <div className="rounded-lg bg-gray-200 overflow-hidden shadow divide-y divide-gray-200 sm:divide-y-0 sm:grid sm:grid-cols-2 sm:gap-px">
      {data.map((link) => (
        <div
          key={link._id}
          className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-500"
        >
          <div>
            <span className="bg-indigo-50 text-indigo-700 rounded-lg inline-flex p-3 ring-4 ring-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </span>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-medium">
              <a href={link.url} target="_blank" className="focus:outline-none">
                <span className="absolute inset-0" aria-hidden="true" />
                {link.title}
              </a>
            </h3>
          </div>
        </div>
      ))}
    </div>
  );
};
