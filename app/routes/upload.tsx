
import { prepareInstructions } from '../../constants';
import React, { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router';
import FileUploader from '~/components/FileUploader';
import Navbar from '~/components/Navbar'
import { convertPdfToImage } from '~/lib/pdf2img';
import { usePuterStore } from '~/lib/puter';
import { generateUUID } from '~/lib/utils';

const upload = () => {
    const {auth, isLoading ,fs, ai , kv, puterReady, error: puterError} = usePuterStore();
    const navigate= useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleFileSelect = (File: File | null) => {
        setFile(File);
    }

    const handleAnalyze = async ({ companyName, jobTitle, jobDescription, file }: { companyName: string, jobTitle: string, jobDescription: string, file: File  }) => {
        setIsProcessing(true);
        try {
        if (!puterReady) {
            setStatusText('Waiting for platform services to initialize...');
            // simple wait loop for puterReady (max 10s)
            const start = Date.now();
            while (!puterReady && Date.now() - start < 10000) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise((r) => setTimeout(r, 200));
            }
            if (!puterReady) {
                setStatusText('Error: platform failed to initialize');
                setIsProcessing(false);
                return;
            }
        }

        setStatusText('Uploading the file...');
        const uploadedFile = await fs.upload([file]);
        console.log('uploadedFile', uploadedFile);
        if(!uploadedFile?.path) {
            setStatusText('Error: Failed to upload file');
            setIsProcessing(false);
            return;
        }

        setStatusText('Converting to image...');
        const imageFile = await convertPdfToImage(file);
        if(!imageFile.file) {
            setStatusText('Error: Failed to convert PDF to image');
            setIsProcessing(false);
            return;
        }

        setStatusText('Uploading the image...');
        const uploadedImage = await fs.upload([imageFile.file]);
        console.log('uploadedImage', uploadedImage);
        if(!uploadedImage?.path) {
            setStatusText('Error: Failed to upload image');
            setIsProcessing(false);
            return;
        }

        setStatusText('Preparing data...');
        const uuid = generateUUID();
        const data = {
            id: uuid,
            resumePath: uploadedFile.path,
            imagePath: uploadedImage.path,
            companyName, jobTitle, jobDescription,
            feedback: '',
        }
        await kv.set(`resume:${uuid}`, JSON.stringify(data));

        setStatusText('Analyzing...');

        const feedback = await ai.feedback(
            uploadedFile.path,
            prepareInstructions({ jobTitle, jobDescription })
        )
        console.log('feedback', feedback);
        if (!feedback) {
            setStatusText('Error: Failed to analyze resume');
            setIsProcessing(false);
            return;
        }

        // Robustly handle message content shape
        let feedbackText: string | null = null;
        const content = feedback?.message?.content;
        if (typeof content === 'string') {
            feedbackText = content;
        } else if (Array.isArray(content) && content.length > 0) {
            // try known shapes
            const first = content[0];
            feedbackText = first.text ?? first.content ?? JSON.stringify(first);
        }

        if (!feedbackText) {
            setStatusText('Error: Unexpected analysis response');
            setIsProcessing(false);
            return;
        }

        try {
            data.feedback = JSON.parse(feedbackText);
        } catch (err) {
            console.error('Failed to parse feedbackText', feedbackText, err);
            setStatusText('Error: Failed to parse analysis result');
            setIsProcessing(false);
            return;
        }
        await kv.set(`resume:${uuid}`, JSON.stringify(data));
        setStatusText('Analysis complete, redirecting...');
        console.log(data);
        navigate(`/resume/${uuid}`);
        return;
        } catch (err) {
            console.error('handleAnalyze error', err);
            setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
            setIsProcessing(false);
            return;
        }
    }
    

    const handleSubmit = (e: FormEvent<HTMLFormElement>)=>{
        e.preventDefault();
        const form= e.currentTarget.closest('form');
        if (!form) return;
        const formData = new FormData(form);

        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;
        
        if(!file) return;
        handleAnalyze({ companyName, jobTitle, jobDescription, file });

        }

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover">
    <Navbar/>
    <section className="main-section">
        <div className="page-heading py-16">
            <h1>Smart feedback for your dream job</h1>
            {puterError && (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {puterError}
                </div>
            )}
            {isProcessing ? (
                <>
                <h2>{statusText}</h2>
                <img src="\images\resume-scan.gif" className="w-full" />
                </>
            ):(
                <h2>Drop your resume for ATS score and improvement tips</h2>
            )}
            {!isProcessing && (
                <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8" >
                    <div className="form-div">
                        <label htmlFor="campany-name">Company Name</label>
                        <input type="text" id="company-name" name="company-name" placeholder="Company Name" />
                    </div>
                    <div className="form-div">
                        <label htmlFor="job-title">Job Title</label>
                        <input type="text" name="job-title" placeholder="Job Title" id="job-title" />
                    </div>
                    <div className="form-div">
                        <label htmlFor="job-description">Job Description</label>
                        <textarea rows={5} name="job-description" placeholder="Job Description" id="job-description" />
                    </div>

                    <div className="form-div">
                        <label htmlFor="uploader">Upload Resume</label>
                        <FileUploader onFileSelect={handleFileSelect}/>
                    </div>

                    <button className="primary-button" type="submit" disabled={!puterReady || !!puterError}>
                        {puterError ? 'Connection failed' : puterReady ? 'Analyze Resume' : 'Initializing platform...'}
                    </button>
                </form>
            )}
        </div>
    </section>
    </main>
  )
}

export default upload
