import { dirname, join } from "path";
import { useCallback, useEffect } from "react";
import useTransferDialog from "components/system/Dialogs/Transfer/useTransferDialog";
import { createFileReaders } from "components/system/Files/FileManager/functions";
import { type FocusEntryFunctions } from "components/system/Files/FileManager/useFocusableEntries";
import {
  type Files,
  type FolderActions,
} from "components/system/Files/FileManager/useFolder";
import { type FileManagerViewNames } from "components/system/Files/Views";
import { useFileSystem } from "contexts/fileSystem";
import { useProcesses } from "contexts/process";
import { useSession } from "contexts/session";
import {
  DESKTOP_PATH,
  PREVENT_SCROLL,
  SHORTCUT_EXTENSION,
} from "utils/constants";
import {
  haltEvent,
  saveUnpositionedDesktopIcons,
  sendMouseClick,
} from "utils/functions";

type KeyboardShortcutEntry = (file?: string) => React.KeyboardEventHandler;

const useFileKeyboardShortcuts = (
  files: Files,
  url: string,
  focusedEntries: string[],
  setRenaming: React.Dispatch<React.SetStateAction<string>>,
  { blurEntry, focusEntry }: FocusEntryFunctions,
  { newPath, pasteToFolder }: FolderActions,
  updateFiles: (newFile?: string, oldFile?: string) => void,
  fileManagerRef: React.RefObject<HTMLOListElement | null>,
  id?: string,
  isStartMenu?: boolean,
  isDesktop?: boolean,
  setView?: (newView: FileManagerViewNames) => void
): KeyboardShortcutEntry => {
  const { copyEntries, deletePath, moveEntries } = useFileSystem();
  const { open, url: changeUrl } = useProcesses();
  const { openTransferDialog } = useTransferDialog();
  const { foregroundId, setIconPositions } = useSession();

  useEffect(() => {
    const pasteHandler = (event: ClipboardEvent): void => {
      if (
        event.clipboardData?.files?.length &&
        ((!foregroundId && isDesktop) || foregroundId === id)
      ) {
        event.stopImmediatePropagation?.();
        createFileReaders(event.clipboardData.files, url, newPath).then(
          openTransferDialog
        );
      }
    };

    document.addEventListener("paste", pasteHandler);

    return () => document.removeEventListener("paste", pasteHandler);
  }, [foregroundId, id, isDesktop, newPath, openTransferDialog, url]);

  return useCallback(
    (file?: string): React.KeyboardEventHandler =>
      (event) => {
        if (isStartMenu) return;

        const { altKey, ctrlKey, key, target, shiftKey } = event;

        if (shiftKey) {
          if (ctrlKey && !isDesktop) {
            const updateViewAndFocus = (
              newView: FileManagerViewNames
            ): void => {
              setView?.(newView);
              requestAnimationFrame(() =>
                fileManagerRef.current?.focus(PREVENT_SCROLL)
              );
            };

            // eslint-disable-next-line default-case
            switch (key) {
              case "#": // 3
                updateViewAndFocus("icon");
                break;
              case "^": // 6
                updateViewAndFocus("details");
                break;
            }
          }

          return;
        }

        const onDelete = (): void => {
          if (focusedEntries.length > 0) {
            haltEvent(event);

            if (url === DESKTOP_PATH) {
              saveUnpositionedDesktopIcons(setIconPositions);
            }

            focusedEntries.forEach(async (entry) => {
              const path = join(url, entry);

              if (await deletePath(path)) updateFiles(undefined, path);
            });
            blurEntry();
          }
        };

        if (ctrlKey) {
          const lKey = key.toLowerCase();

          // eslint-disable-next-line default-case
          switch (lKey) {
            case "a":
              haltEvent(event);
              if (target instanceof HTMLOListElement) {
                const [firstEntry] = target.querySelectorAll("button");

                firstEntry?.focus(PREVENT_SCROLL);
              }
              Object.keys(files).forEach((fileName) => focusEntry(fileName));
              break;
            case "c":
              haltEvent(event);
              copyEntries(focusedEntries.map((entry) => join(url, entry)));
              break;
            case "d":
              onDelete();
              break;
            case "r":
              haltEvent(event);
              updateFiles();
              break;
            case "x":
              haltEvent(event);
              moveEntries(focusedEntries.map((entry) => join(url, entry)));
              break;
            case "v":
              event.stopPropagation();
              if (target instanceof HTMLOListElement) {
                pasteToFolder();
              }
              break;
          }
        } else if (altKey) {
          const lKey = key.toLowerCase();

          if (lKey === "n") {
            haltEvent(event);
            open("FileExplorer", { url });
          } else if (key === "Enter" && focusedEntries.length > 0) {
            haltEvent(event);
            open("Properties", { url: join(url, focusedEntries[0]) });
          }
        } else {
          switch (key) {
            case "F2":
              if (focusedEntries.length > 0 && file) {
                haltEvent(event);
                setRenaming(file);
              }
              break;
            case "F5":
              if (id) {
                haltEvent(event);
                updateFiles();
              }
              break;
            case "Delete":
              onDelete();
              break;
            case "Backspace":
              if (id) {
                haltEvent(event);
                changeUrl(id, dirname(url));
              }
              break;
            case "Enter":
              if (
                focusedEntries.length > 0 &&
                target instanceof HTMLButtonElement
              ) {
                haltEvent(event);
                sendMouseClick(target, 2);
              }
              break;
            default:
              if (key.startsWith("Arrow")) {
                haltEvent(event);

                if (!(target instanceof HTMLElement)) return;

                let targetElement = target;

                if (!(target instanceof HTMLButtonElement)) {
                  targetElement = target.querySelector(
                    "button"
                  ) as HTMLButtonElement;
                  if (!targetElement) return;
                }

                const { x, y, height, width } =
                  targetElement.getBoundingClientRect();
                let movedElement =
                  key === "ArrowUp" || key === "ArrowDown"
                    ? document.elementFromPoint(
                        x,
                        y + height / 2 + (key === "ArrowUp" ? -height : height)
                      )
                    : document.elementFromPoint(
                        x + width / 2 + (key === "ArrowLeft" ? -width : width),
                        y
                      );

                if (movedElement instanceof HTMLOListElement) {
                  const nearestLi = targetElement.closest("li");

                  if (nearestLi instanceof HTMLLIElement) {
                    const olChildren = [...movedElement.children];
                    const liPosition = olChildren.indexOf(nearestLi);

                    if (key === "ArrowUp" || key === "ArrowDown") {
                      movedElement =
                        olChildren[
                          key === "ArrowUp"
                            ? liPosition === 0
                              ? olChildren.length - 1
                              : liPosition - 1
                            : liPosition === olChildren.length - 1
                              ? 0
                              : liPosition + 1
                        ].querySelector("button");
                    }
                  }
                }

                const closestButton = movedElement?.closest("button");
                let dispatchElement: HTMLElement = closestButton as HTMLElement;

                if (
                  !(closestButton instanceof HTMLButtonElement) ||
                  !fileManagerRef.current?.contains(closestButton)
                ) {
                  dispatchElement = targetElement;
                }

                dispatchElement?.dispatchEvent(
                  new MouseEvent("mousedown", {
                    bubbles: true,
                  })
                );
              } else if (/^[\da-z]$/i.test(key)) {
                haltEvent(event);

                const fileNames = Object.keys(files);
                const lastFocusedEntryIndex = fileNames.indexOf(
                  focusedEntries[focusedEntries.length - 1]
                );
                const lowerCaseKey = key.toLowerCase();
                const upperCaseKey = key.toUpperCase();
                const fileNamesStartingFromLastFocusedEntry = [
                  ...fileNames.slice(lastFocusedEntryIndex),
                  ...fileNames.slice(0, lastFocusedEntryIndex),
                ];
                const focusOnEntry = fileNamesStartingFromLastFocusedEntry.find(
                  (name) =>
                    !focusedEntries.includes(name) &&
                    (name.startsWith(lowerCaseKey) ||
                      name.startsWith(upperCaseKey))
                );

                if (focusOnEntry) {
                  blurEntry();
                  focusEntry(focusOnEntry);

                  try {
                    fileManagerRef.current
                      ?.querySelector(
                        `button[aria-label='${CSS.escape(focusOnEntry.replace(SHORTCUT_EXTENSION, ""))}']`
                      )
                      ?.scrollIntoView();
                  } catch {
                    // Ignore error getting/scrolling element
                  }
                }
              }
          }
        }
      },
    [
      blurEntry,
      changeUrl,
      copyEntries,
      deletePath,
      fileManagerRef,
      files,
      focusEntry,
      focusedEntries,
      id,
      isDesktop,
      isStartMenu,
      moveEntries,
      open,
      pasteToFolder,
      setIconPositions,
      setRenaming,
      setView,
      updateFiles,
      url,
    ]
  );
};

export default useFileKeyboardShortcuts;
