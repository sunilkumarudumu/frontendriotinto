type WelcomeSectionProps = {
  onUpload?: () => void
}

export default function WelcomeSection({ onUpload }: WelcomeSectionProps) {
  return (
    <section className="flex min-h-0 w-full flex-1 items-center justify-center px-8 pt-[192px] pb-8">
      <div className="w-full text-center">
        <p className="font-ui text-[15px] leading-[19px] font-bold text-[#272727]">
          Welcome to the CYIDP Tool!
        </p>
        <p className="font-ui text-[15px] leading-[19px] font-bold text-[#272727]">
          Upload your documents to begin processing with the CYIDP Tool.
        </p>
        <p className="font-ui text-[15px] leading-[19px] font-bold text-[#272727]">
          If you need more information or guidance, click the Help button to learn more about the
          tool and its features.
        </p>

        <button
          type="button"
          onClick={onUpload}
          className="mt-5 inline-flex h-[31px] w-[170px] cursor-pointer items-center justify-between rounded-[4px] border border-cy-purple bg-white px-3.5 font-ui text-[14px] font-normal text-cy-purple transition-colors hover:bg-[#f8f4fc]"
        >
          <span>Upload Files</span>
          <span aria-hidden="true" className="text-[15px] leading-none font-semibold">
            &gt;
          </span>
        </button>
      </div>
    </section>
  )
}
