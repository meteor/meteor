import React from "react";
import { useFind, useSubscribe } from "meteor/react-meteor-data";
import { LinksCollection } from "../api/links";

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export const Info = () => {
  const foreGroundColors = [
    "text-red-700",
    "text-orange-700",
    "text-rose-700",
    "text-yellow-700",
  ];
  const backgroundColors = [
    "bg-red-50",
    "bg-orange-50",
    "bg-rose-50",
    "bg-yellow-50",
  ];
  const isLoading = useSubscribe("links");

  const data = useFind(() => LinksCollection.find());

  const links = data.map((d, index) => ({
    ...d,
    iconForeground: foreGroundColors[index],
    iconBackground: backgroundColors[index],
  }));

  if (isLoading()) {
    return <div>Loading...</div>;
  }

  const actions = links.map((link) => ({
    id: link._id,
    title: link.title,
    href: link.url,
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={ 2 }
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        />
      </svg>
    ),
    ...link,
  }));

  return (
    <div
      className="rounded-lg bg-gray-200 overflow-hidden shadow divide-y divide-gray-200 sm:divide-y-0 sm:grid sm:grid-cols-2 sm:gap-px">
      { actions.map((action, actionIdx) => (
        <div
          key={ action.title }
          className={ classNames(
            actionIdx === 0
              ? "rounded-tl-lg rounded-tr-lg sm:rounded-tr-none"
              : "",
            actionIdx === 1 ? "sm:rounded-tr-lg" : "",
            actionIdx === actions.length - 2 ? "sm:rounded-bl-lg" : "",
            actionIdx === actions.length - 1
              ? "rounded-bl-lg rounded-br-lg sm:rounded-bl-none"
              : "",
            "relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-indigo-500"
          ) }
        >
          <div>
            <span
              className={ classNames(
                action.iconBackground,
                action.iconForeground,
                "rounded-lg inline-flex p-3 ring-4 ring-white"
              ) }
            >
              { action.icon }
            </span>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-medium">
              <a
                href={ action.href }
                target="_blank"
                className="focus:outline-none"
              >
                {/* Extend touch target to entire panel */ }
                <span className="absolute inset-0" aria-hidden="true"/>
                { action.title }
              </a>
            </h3>
          </div>
        </div>
      )) }
    </div>
  );
};
